-- ============================================================
--  DocAI — Supabase Schema v2
--  Ejecuta este SQL en el SQL Editor de tu proyecto Supabase
--  IDEMPOTENTE: usa IF NOT EXISTS / ON CONFLICT
-- ============================================================

-- Extensión para UUID
create extension if not exists "uuid-ossp";

-- ─── TABLA: documents ────────────────────────────────────────
create table if not exists public.documents (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  original_name text not null,
  storage_path  text not null unique,
  file_size     bigint,
  page_count    int,
  status        text default 'pending' check (status in ('pending','processing','ready','error')),
  error_message text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.documents enable row level security;

-- Drop and re-create policy cleanly
drop policy if exists "Users see own documents" on public.documents;
create policy "Users see own documents"
  on public.documents for all
  using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_documents_user_id      on public.documents(user_id);
create index if not exists idx_documents_status       on public.documents(user_id, status);
create index if not exists idx_documents_created_at   on public.documents(user_id, created_at desc);

-- ─── TABLA: chat_sessions ─────────────────────────────────────
create table if not exists public.chat_sessions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  title      text not null default 'Nueva conversación',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;

drop policy if exists "Users see own sessions" on public.chat_sessions;
create policy "Users see own sessions"
  on public.chat_sessions for all
  using (auth.uid() = user_id);

create index if not exists idx_chat_sessions_user_id    on public.chat_sessions(user_id);
create index if not exists idx_chat_sessions_updated_at on public.chat_sessions(user_id, updated_at desc);

-- ─── TABLA: chat_messages ─────────────────────────────────────
create table if not exists public.chat_messages (
  id         uuid primary key default uuid_generate_v4(),
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade not null,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  references jsonb,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "Users see own messages" on public.chat_messages;
create policy "Users see own messages"
  on public.chat_messages for all
  using (auth.uid() = user_id);

create index if not exists idx_chat_messages_session on public.chat_messages(session_id, created_at asc);
create index if not exists idx_chat_messages_user    on public.chat_messages(user_id);

-- ─── TABLA: document_chunks ───────────────────────────────────
create table if not exists public.document_chunks (
  id            uuid primary key default uuid_generate_v4(),
  document_id   uuid references public.documents(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  pinecone_id   text not null,
  chunk_index   int  not null,
  page_number   int,
  chunk_text    text not null,
  created_at    timestamptz default now()
);

alter table public.document_chunks enable row level security;

drop policy if exists "Users see own chunks" on public.document_chunks;
create policy "Users see own chunks"
  on public.document_chunks for all
  using (auth.uid() = user_id);

create index if not exists idx_chunks_document_id on public.document_chunks(document_id);
create index if not exists idx_chunks_user_id     on public.document_chunks(user_id);

-- ─── STORAGE BUCKET ───────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,  -- 50 MB
  array['application/pdf']
)
on conflict (id) do update set
  file_size_limit     = excluded.file_size_limit,
  allowed_mime_types  = excluded.allowed_mime_types;

drop policy if exists "Users upload own documents" on storage.objects;
create policy "Users upload own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
    and (storage.extension(name)) = 'pdf'
  );

drop policy if exists "Users read own documents" on storage.objects;
create policy "Users read own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own documents" on storage.objects;
create policy "Users delete own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── TRIGGERS: updated_at automático ─────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.update_updated_at();

drop trigger if exists sessions_updated_at on public.chat_sessions;
create trigger sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.update_updated_at();
