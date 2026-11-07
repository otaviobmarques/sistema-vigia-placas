-- Uma placa pode ter vários condutores (e um condutor várias placas); impedimento manual de dirigir.
create table if not exists placa_condutores (
  placa_id uuid not null references placas(id),
  condutor_id uuid not null references condutores(id),
  cliente_id uuid not null references clientes(id),
  criado_em timestamptz not null default now(),
  primary key (placa_id, condutor_id)
);
create index if not exists placa_condutores_condutor on placa_condutores (condutor_id);
alter table placa_condutores enable row level security;
drop policy if exists isolamento on placa_condutores;
create policy isolamento on placa_condutores using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id));
grant select, insert, update, delete on placa_condutores to vigia_app;

-- O condutor principal de cada placa já vira um vínculo.
insert into placa_condutores (placa_id, condutor_id, cliente_id)
  select p.id, p.condutor_principal_id, p.cliente_id from placas p where p.condutor_principal_id is not null
  on conflict do nothing;

alter table condutores add column if not exists impedido boolean not null default false;
alter table condutores add column if not exists motivo_impedimento text;

-- Preços negociados por cliente além de placa/saving: defesa e taxa de conveniência (null = valores globais).
alter table clientes add column if not exists preco_defesa_personalizado int;
alter table clientes add column if not exists taxa_conv_tipo_personalizado text;
alter table clientes add column if not exists taxa_conv_valor_personalizado int;
alter table clientes drop constraint if exists clientes_precos_extra_check;
alter table clientes add constraint clientes_precos_extra_check check (
  (preco_defesa_personalizado is null or preco_defesa_personalizado >= 0)
  and (taxa_conv_tipo_personalizado is null or taxa_conv_tipo_personalizado in ('fixa','percentual'))
  and (taxa_conv_valor_personalizado is null or taxa_conv_valor_personalizado >= 0)
);
