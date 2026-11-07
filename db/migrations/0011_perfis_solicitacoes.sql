-- Perfis: Administrador do Sistema / Gestor do Vigia Placa (nível franqueadora) e
-- Responsável / Visualizador (nível cliente). Clientes passam a SOLICITAR inclusão e remoção de placas.

-- Usuários de cliente: gestor e financeiro viram Responsável (admin).
update usuarios set perfil = 'admin' where nivel = 'cliente' and perfil in ('gestor', 'financeiro');

create table if not exists solicitacoes_placa (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  tipo text not null check (tipo in ('inclusao', 'remocao')),
  placa text not null,
  renavam text,
  uf text,
  apelido text,
  grupo text,
  placa_id uuid references placas(id),
  motivo text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  resposta text,
  solicitado_por uuid references usuarios(id),
  decidido_por uuid references usuarios(id),
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists solicitacoes_placa_pendentes on solicitacoes_placa (status, criado_em);
create unique index if not exists solicitacoes_placa_unica_pendente on solicitacoes_placa (cliente_id, placa, tipo) where status = 'pendente';

alter table solicitacoes_placa enable row level security;
drop policy if exists isolamento on solicitacoes_placa;
create policy isolamento on solicitacoes_placa using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id));
grant select, insert, update on solicitacoes_placa to vigia_app;
