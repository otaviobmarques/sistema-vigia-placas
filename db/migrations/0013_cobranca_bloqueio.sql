-- Ciclo de fechamento por cliente, faturas por período, bloqueio e exclusão (lógica) de clientes.
alter table clientes add column if not exists ciclo_fechamento text not null default 'mensal';
alter table clientes add column if not exists vencimento_dias int not null default 5;
alter table clientes add column if not exists bloqueado_em timestamptz;
alter table clientes add column if not exists motivo_bloqueio text;
alter table clientes add column if not exists excluido_em timestamptz;
alter table clientes drop constraint if exists clientes_ciclo_check;
alter table clientes add constraint clientes_ciclo_check check (ciclo_fechamento in ('diario','semanal','quinzenal','mensal') and vencimento_dias between 0 and 60);

alter table faturas add column if not exists periodo_inicio date;
alter table faturas add column if not exists periodo_fim date;
alter table faturas add column if not exists vencimento date;
alter table faturas add column if not exists forma text;
update faturas set periodo_inicio = (mes || '-01')::date, periodo_fim = ((mes || '-01')::date + interval '1 month' - interval '1 day')::date
  where periodo_inicio is null;
alter table faturas alter column periodo_inicio set not null;
alter table faturas alter column periodo_fim set not null;
alter table faturas drop constraint if exists faturas_cliente_id_mes_key;
create unique index if not exists faturas_cliente_periodo on faturas (cliente_id, periodo_inicio);
