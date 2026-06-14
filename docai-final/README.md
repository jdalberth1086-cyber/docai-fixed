# DocAI — Biblioteca Inteligente para Profesoras

Sube PDFs, genera embeddings con Google Gemini y consulta tus documentos con IA semántica.

## Stack
- **Frontend / Backend**: Next.js 14 (App Router)
- **Auth + DB + Storage**: Supabase
- **Embeddings + Chat**: Google Gemini (`text-embedding-004` + `gemini-1.5-flash`)
- **Vector DB**: Pinecone (índice 768 dims)
- **Deploy**: Vercel

---

## ⚙️ Variables de entorno requeridas

Copia `.env.example` → `.env.local` y completa:

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role) |
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| `PINECONE_API_KEY` | https://app.pinecone.io → API Keys |
| `PINECONE_INDEX_NAME` | Nombre de tu índice Pinecone (dim: **768**, metric: **cosine**) |
| `NEXT_PUBLIC_APP_URL` | URL pública (ej: `https://tu-app.vercel.app`) |

---

## 🗄️ Base de datos Supabase

Ejecuta el archivo `supabase-schema.sql` en el SQL Editor de tu proyecto Supabase.  
Este script es **idempotente** — puedes ejecutarlo varias veces sin problema.

---

## 🔺 Pinecone: crear el índice

1. Ve a https://app.pinecone.io
2. Crea un índice con:
   - **Dimensions**: `768`
   - **Metric**: `cosine`
   - **Name**: el valor de `PINECONE_INDEX_NAME` (ej: `docai-index`)
3. Copia la API key y agrégala a tus variables de entorno.

---

## 🚀 Deploy en Vercel (paso a paso)

### 1. Prepara el repositorio
```bash
git init
git add .
git commit -m "chore: initial commit"
# Crea un repo en GitHub y haz push
git remote add origin https://github.com/tuusuario/docai.git
git push -u origin main
```

### 2. Conecta con Vercel
1. Ve a https://vercel.com → **Add New Project**
2. Importa tu repositorio de GitHub
3. En **Environment Variables**, agrega **todas** las variables del `.env.example`
4. Haz clic en **Deploy**

### 3. Configura Supabase Auth (URLs permitidas)
En Supabase → Authentication → URL Configuration:
- **Site URL**: `https://tu-app.vercel.app`
- **Redirect URLs**: `https://tu-app.vercel.app/auth/callback`

### 4. Configura Google OAuth (opcional)
En Supabase → Authentication → Providers → Google:
- Activa Google
- Agrega el Client ID y Secret de Google Cloud Console
- Authorized redirect URI: `https://tu-proyecto.supabase.co/auth/v1/callback`

### 5. Actualiza NEXT_PUBLIC_APP_URL
En Vercel → Project → Settings → Environment Variables:
- Cambia `NEXT_PUBLIC_APP_URL` a `https://tu-app.vercel.app`
- Redeploy

---

## 💻 Desarrollo local

```bash
npm install
cp .env.example .env.local
# Edita .env.local con tus valores reales
npm run dev
```

Abre http://localhost:3000

---

## 🔒 Seguridad implementada

- **RLS** en todas las tablas de Supabase (cada usuario solo ve sus datos)
- **Namespace Pinecone** por usuario (aislamiento de vectores)
- **Service Role** solo en API routes del servidor, nunca expuesta al cliente
- **Storage policies** que validan ownership y extensión `.pdf`
- **Headers de seguridad**: X-Frame-Options, CSP, HSTS, X-Content-Type-Options
- **Validación UUID** en todas las API routes
- **Límite de tamaño** validado tanto en cliente (50 MB) como servidor

---

## 📝 Notas técnicas

- El procesamiento de PDFs puede tomar hasta 60 segundos para libros grandes
- El frontend muestra polling automático cada 4s para documentos en proceso
- Los embeddings se generan con Gemini `text-embedding-004` (768 dims)
- Los vectores se organizan por `namespace = userId` en Pinecone
