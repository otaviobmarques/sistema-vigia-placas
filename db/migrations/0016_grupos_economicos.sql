-- Grupo econômico: vários clientes (CNPJs) da mesma empresa/holding, para relatórios consolidados.
create table if not exists grupos_economicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  observacao text,
  criado_em timestamptz not null default now()
);
create unique index if not exists grupos_economicos_nome on grupos_economicos (lower(nome));
alter table clientes add column if not exists grupo_id uuid references grupos_economicos(id) on delete set null;
create index if not exists clientes_grupo on clientes (grupo_id);

-- Só a equipe Vigia Placa vê e mantém os grupos (o cliente não enxerga o agrupamento).
alter table grupos_economicos enable row level security;
drop policy if exists equipe on grupos_economicos;
create policy equipe on grupos_economicos using (app_nivel() in ('franqueadora', 'franqueado')) with check (app_nivel() in ('franqueadora', 'franqueado'));
grant select, insert, update, delete on grupos_economicos to vigia_app;
