-- Notificações push (web push / PWA) e controle de entrega da fila de mensagens.
create table if not exists push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  cliente_id uuid references clientes(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  falhas int not null default 0
);
create index if not exists push_assinaturas_cliente on push_assinaturas (cliente_id);
-- Só o contexto de sistema lê e grava (sem políticas para vigia_app).
alter table push_assinaturas enable row level security;

alter table outbox add column if not exists url text;
alter table outbox add column if not exists enviado_em timestamptz;
alter table outbox add column if not exists erro text;
