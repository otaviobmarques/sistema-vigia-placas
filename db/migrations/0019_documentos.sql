-- Boletos e documentos das multas (PDF guardado no banco por 60 dias; os links das fontes expiram).
alter table multas add column if not exists boleto_url text;
alter table multas add column if not exists pix_copia_cola text;
alter table multas_antt add column if not exists codigo_barras text;

create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  multa_id uuid references multas(id) on delete cascade,
  multa_antt_id uuid references multas_antt(id) on delete cascade,
  tipo text not null check (tipo in ('boleto', 'auto_antt', 'boleto_antt')),
  nome text not null,
  mime text not null,
  conteudo_base64 text not null,
  origem_url text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '60 days'
);
create index if not exists documentos_multa on documentos (multa_id);
create index if not exists documentos_multa_antt on documentos (multa_antt_id);
create index if not exists documentos_expira on documentos (expira_em);
alter table documentos enable row level security;
drop policy if exists isolamento on documentos;
create policy isolamento on documentos using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id));
grant select, insert, update, delete on documentos to vigia_app;
