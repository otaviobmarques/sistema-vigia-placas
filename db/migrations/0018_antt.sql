-- ANTT / SIFAMA: multas regulatórias de transporte, aplicadas ao CNPJ/CPF do transportador (não à placa).
-- Acesso ao SIFAMA de cada cliente (login e senha do próprio cliente; a senha fica cifrada com AES-256-GCM).
alter table clientes add column if not exists antt_ativo boolean not null default false;
alter table clientes add column if not exists antt_login text;
alter table clientes add column if not exists antt_senha_cifrada text;
alter table clientes add column if not exists antt_cnpj_representado text;
alter table clientes add column if not exists antt_ultima_consulta timestamptz;
alter table clientes add column if not exists antt_ultimo_erro text;
-- Totais do SIFAMA na última consulta (impeditivas, não impeditivas, suspensão judicial, débito).
alter table clientes add column if not exists antt_resumo jsonb;

create table if not exists multas_antt (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  auto text not null,
  processo text,
  codigo text,
  descricao text,
  tipo_fiscalizacao text,
  orgao text,
  placa text,
  data_infracao date,
  vencimento date,
  valor int not null default 0,
  situacao text,
  impeditiva boolean,
  aberta boolean not null default true,
  dados jsonb,
  detectada_em date not null default current_date,
  atualizada_em timestamptz not null default now(),
  unique (cliente_id, auto)
);
create index if not exists multas_antt_cliente on multas_antt (cliente_id, aberta);
alter table multas_antt enable row level security;
drop policy if exists isolamento on multas_antt;
create policy isolamento on multas_antt using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id));
grant select, insert, update, delete on multas_antt to vigia_app;

-- Consulta da ANTT é por cliente (CNPJ), não por placa: o custo entra em "Custo por API" sem placa.
alter table consultas alter column placa_id drop not null;
insert into fontes (id, nome, ativa, prioridade, custo) values ('infosimples:antt/sifama/consultar-multas', 'ANTT · SIFAMA (multas)', true, 1, 20)
  on conflict (id) do nothing;
