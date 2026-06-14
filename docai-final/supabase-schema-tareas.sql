-- ============================================================
--  DocAI Escolar — Schema ADICIONAL para módulo de Tareas
--  Ejecuta esto en Supabase SQL Editor (es idempotente)
--  NO modifica las tablas existentes (documents, chat_sessions, etc.)
-- ============================================================

-- ─── TABLA: tareas ────────────────────────────────────────────
create table if not exists public.tareas (
  id                   uuid primary key default uuid_generate_v4(),
  estudiante_nombre    text not null,
  estudiante_documento text not null,
  estudiante_whatsapp  text,
  estudiante_email     text,
  materia              text not null,
  descripcion          text,
  storage_path         text not null unique,
  original_name        text not null,
  file_size            bigint,
  status               text not null default 'recibido'
                         check (status in ('recibido','revisado','devuelto')),
  recibido_en          timestamptz not null default now(),
  comentario_admin     text,
  revisado_por         uuid references auth.users(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- RLS: habilitado pero el admin lo accede con service_role (bypass RLS)
-- Los estudiantes NO tienen sesión, así que usamos service_role en la API
alter table public.tareas enable row level security;

-- Política para admin autenticado: ver todo
drop policy if exists "Admin ve todas las tareas" on public.tareas;
create policy "Admin ve todas las tareas"
  on public.tareas for all
  using (auth.role() = 'authenticated');

-- Índices para búsqueda eficiente
create index if not exists idx_tareas_documento
  on public.tareas(estudiante_documento);

create index if not exists idx_tareas_nombre
  on public.tareas using gin(to_tsvector('spanish', estudiante_nombre));

create index if not exists idx_tareas_recibido
  on public.tareas(recibido_en desc);

create index if not exists idx_tareas_status
  on public.tareas(status, recibido_en desc);

create index if not exists idx_tareas_materia
  on public.tareas(materia);

-- Trigger updated_at
drop trigger if exists tareas_updated_at on public.tareas;
create trigger tareas_updated_at
  before update on public.tareas
  for each row execute function public.update_updated_at();

-- ─── STORAGE BUCKET: tareas ───────────────────────────────────
-- Bucket privado para archivos de tareas de estudiantes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tareas',
  'tareas',
  false,
  20971520,  -- 20 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- El bucket 'tareas' solo es accesible via service_role (API servidor)
-- No se crean políticas de storage para usuarios anónimos por seguridad
-- La API /api/tareas/submit usa el admin client (service_role) para subir

-- ─── VERIFICACIÓN FINAL ───────────────────────────────────────
-- Ejecuta esto para confirmar que todo quedó bien:
-- select table_name from information_schema.tables where table_schema='public';
-- select id, name, public from storage.buckets;
