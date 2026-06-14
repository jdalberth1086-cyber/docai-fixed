# 🚀 GUÍA COMPLETA DE DEPLOY — DocAI Escolar
# ============================================================

## ARCHIVOS MODIFICADOS (copia y pega sobre tu proyecto)

```
src/lib/gemini.ts                          ← FIX CRÍTICO: modelo de embeddings corregido
src/lib/pinecone.ts                        ← FIX: deleteDocumentVectors limpio para v4
src/lib/whatsapp.ts                        ← NUEVO: notificaciones WhatsApp
src/types/index.ts                         ← NUEVO: tipos de tareas escolares
src/middleware.ts                          ← ACTUALIZADO: rutas públicas /tarea
src/components/layout/Sidebar.tsx          ← ACTUALIZADO: enlace a tareas
src/components/tareas/AdminTareasClient.tsx ← NUEVO: panel admin tareas
src/app/api/tareas/submit/route.ts         ← NUEVO: endpoint recepción tareas
src/app/api/tareas/list/route.ts           ← NUEVO: listar tareas (admin)
src/app/api/tareas/historial/route.ts      ← NUEVO: historial por estudiante
src/app/api/tareas/update/route.ts         ← NUEVO: actualizar estado tarea
src/app/api/documents/delete-vectors/route.ts ← FIX: borrado limpio Pinecone
src/app/tarea/page.tsx                     ← NUEVO: formulario estudiantes
src/app/tarea/historial/page.tsx           ← NUEVO: historial estudiante
src/app/admin/tareas/page.tsx              ← NUEVO: panel admin
supabase-schema-tareas.sql                 ← NUEVO: SQL para tabla tareas
vercel.json                                ← ACTUALIZADO: funciones tareas
.env.example                               ← ACTUALIZADO: vars WhatsApp
```

---

## PASO 1 — Ejecutar SQL en Supabase

1. Ve a https://supabase.com → tu proyecto → **SQL Editor**
2. Abre el archivo `supabase-schema-tareas.sql`
3. Copia todo el contenido y pégalo en el editor
4. Clic en **Run**
5. Verifica que no haya errores rojos

**Verificación:**
```sql
-- Ejecuta esto para confirmar:
select table_name from information_schema.tables 
where table_schema = 'public' 
order by table_name;
-- Debe aparecer: documents, tareas, chat_sessions, chat_messages, document_chunks

select id, name from storage.buckets;
-- Debe aparecer: documents, tareas
```

---

## PASO 2 — Copiar los archivos al proyecto

```bash
# En la raíz de tu proyecto Next.js:

# Crear carpetas nuevas si no existen:
mkdir -p src/app/api/tareas/submit
mkdir -p src/app/api/tareas/list
mkdir -p src/app/api/tareas/historial
mkdir -p src/app/api/tareas/update
mkdir -p src/app/tarea/historial
mkdir -p src/app/admin/tareas
mkdir -p src/components/tareas

# Luego copia cada archivo de la carpeta descargada a su ruta correspondiente.
```

---

## PASO 3 — Verificar Pinecone Index

Tu índice en Pinecone DEBE tener dimensión **768** (text-embedding-004).

1. Ve a https://app.pinecone.io
2. Abre tu índice `docai-index`
3. Verifica que la dimensión sea **768**

⚠️ Si tiene otra dimensión (ej: 1536 de OpenAI o 3072 de Gemini 2.0):
- Crea un índice nuevo con dimension=768
- Actualiza `PINECONE_INDEX_NAME` en Vercel
- Reprocesa tus documentos existentes

---

## PASO 4 — Variables de Entorno en Vercel

Ve a https://vercel.com → tu proyecto → **Settings → Environment Variables**

### Variables existentes (verificar que estén):
```
NEXT_PUBLIC_SUPABASE_URL        = https://zfftjxefzgunseyjsuzx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ...
SUPABASE_SERVICE_ROLE_KEY       = eyJ...
GEMINI_API_KEY                  = AIza...
PINECONE_API_KEY                = pcsk_...
PINECONE_INDEX_NAME             = docai-index
NEXT_PUBLIC_APP_URL             = https://tu-app.vercel.app
```

### Variables NUEVAS para WhatsApp (agrega al menos una opción):

**Opción A — Twilio (recomendado, $0.005/msg):**
```
TWILIO_ACCOUNT_SID    = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN     = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM  = +14155238886
```

**Opción B — CallMeBot (gratis, con limitaciones):**
```
CALLMEBOT_API_KEY = xxxxxxxx
```

**Si NO configuras WhatsApp:** La app funciona igual, simplemente no envía mensajes. La confirmación sigue apareciendo en pantalla.

---

## PASO 5 — Deploy en Vercel

```bash
# Opción A: Push a GitHub (si tienes CI/CD configurado)
git add .
git commit -m "feat: módulo tareas escolares + fix embeddings + fix pinecone"
git push origin main
# Vercel despliega automáticamente

# Opción B: Deploy manual con CLI
npm i -g vercel
vercel --prod
```

---

## PASO 6 — Validación post-deploy

### Test 1: Formulario estudiante
1. Abre `https://tu-app.vercel.app/tarea`
2. Completa todos los campos
3. Sube un PDF pequeño
4. Debe mostrar: **"✅ Tu tarea fue recibida correctamente"** con código de comprobante

### Test 2: Panel admin
1. Inicia sesión en `https://tu-app.vercel.app/login`
2. Ve a **Tareas** en el sidebar
3. Debe aparecer la tarea del test anterior
4. Prueba buscar por nombre y por documento

### Test 3: Historial estudiante
1. Abre `https://tu-app.vercel.app/tarea/historial`
2. Ingresa el número de documento usado en Test 1
3. Debe mostrar la tarea con estado "Recibido ✓"

### Test 4: Embeddings (FIX crítico)
1. Inicia sesión como admin
2. Ve a Documentos → sube un PDF
3. Revisa logs en Vercel → debe decir: `[gemini] Embeddings generados: dim=768`
4. Si dice dim=768 ✅ — si dice otro número ❌ (revisar PINECONE_INDEX_NAME)

### Test 5: Chat IA
1. Ve a Chat IA
2. Haz una pregunta sobre el documento subido
3. Debe responder con información del documento

---

## PASO 7 — Compartir con estudiantes

La URL pública para que los estudiantes entreguen tareas es:
```
https://tu-app.vercel.app/tarea
```

Puedes compartirla como:
- Link directo por WhatsApp
- Código QR (usa qr-code-generator.com)
- En el tablero del salón

---

## 🐛 ERRORES COMUNES Y SOLUCIONES

### Error: "dim mismatch" en Pinecone
**Causa:** El índice tiene dimensión diferente a 768
**Fix:** Crear nuevo índice con dimension=768 en Pinecone

### Error: "GEMINI_API_KEY not set" en producción
**Causa:** Variable no configurada en Vercel
**Fix:** Settings → Environment Variables → agregar GEMINI_API_KEY

### Error: "bucket tareas not found"
**Causa:** No ejecutaste el SQL del Paso 1
**Fix:** Ejecutar `supabase-schema-tareas.sql` en Supabase SQL Editor

### Error 409 al procesar documento ya "ready"
**Comportamiento correcto:** El servidor rechaza re-procesar documentos listos
**Fix:** Usar botón "Reprocesar" que actualiza status a pending primero

### WhatsApp no llega
**Causa:** Proveedor no configurado o número sin formato correcto
**Fix:** 
- Twilio: verificar sandbox y número en formato +57XXXXXXXXXX
- CallMeBot: el estudiante debe haber hecho el proceso de activación previo

---

## 📊 ARQUITECTURA FINAL

```
PÚBLICO (sin login):
  /tarea              → Formulario entrega de tarea
  /tarea/historial    → Ver mis tareas por documento
  /api/tareas/submit  → POST: recibir tarea + WhatsApp
  /api/tareas/historial → GET: historial por documento

ADMIN (con login):
  /dashboard          → Panel principal
  /dashboard/documents → Gestión de documentos
  /dashboard/chat     → Chat IA con documentos
  /admin/tareas       → Panel de tareas recibidas
  /api/tareas/list    → GET: listar tareas con búsqueda
  /api/tareas/update  → PATCH: cambiar estado tarea
  /api/documents/process → POST: procesar PDF con IA
  /api/chat           → POST: chat semántico
```
