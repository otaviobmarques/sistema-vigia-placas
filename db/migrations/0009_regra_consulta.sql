-- Regra de consulta: estratégia de fontes (global), frequência em dias e teto de gasto por cliente.
alter table configuracao add column if not exists estrategia_fontes text not null default 'principal_reserva';
alter table configuracao add column if not exists fonte_principal text not null default 'directdata';
alter table configuracao drop constraint if exists configuracao_estrategia_check;
alter table configuracao add constraint configuracao_estrategia_check
  check (estrategia_fontes in ('principal_reserva','por_uf','alternar','ambas') and fonte_principal in ('directdata','infosimples'));

alter table clientes add column if not exists teto_dados_mensal int;
alter table placas add column if not exists ultima_fonte text;

-- Frequências antigas viram intervalo em dias ("adaptativa" continua igual).
update clientes set frequencia_padrao = case frequencia_padrao when 'diaria' then '1' when 'semanal' then '7' when 'quinzenal' then '15' when 'mensal' then '30' else frequencia_padrao end;
update placas set frequencia = case frequencia when 'diaria' then '1' when 'semanal' then '7' when 'quinzenal' then '15' when 'mensal' then '30' else frequencia end where frequencia is not null;
update planos set frequencia = case frequencia when 'diaria' then '1' when 'semanal' then '7' when 'quinzenal' then '15' when 'mensal' then '30' else frequencia end;
