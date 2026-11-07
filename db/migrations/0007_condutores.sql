-- M13 · Condutores e pontuação: CNH, exame toxicológico e avisos de vencimento.
alter table condutores add column if not exists cnh_categoria text;
alter table condutores add column if not exists cnh_validade date;
alter table condutores add column if not exists toxicologico_validade date;
alter table condutores add column if not exists ativo boolean not null default true;
comment on column condutores.pontos_12m is 'Pontos já existentes na CNH informados pelo cliente (multas fora do Vigia Placa); os das multas indicadas aqui são somados automaticamente.';

create table if not exists alertas_condutor (
  condutor_id uuid not null references condutores(id),
  cliente_id uuid not null references clientes(id),
  tipo text not null check (tipo in ('cnh','toxicologico')),
  referencia date not null,
  antecedencia int not null,
  enviado_em timestamptz not null default now(),
  primary key (condutor_id, tipo, referencia, antecedencia)
);
alter table alertas_condutor enable row level security;
drop policy if exists isolamento on alertas_condutor;
create policy isolamento on alertas_condutor using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id));
grant select, insert, update, delete on alertas_condutor to vigia_app;
