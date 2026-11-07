-- Plano personalizado por cliente: preço por placa/mês e % de saving próprios (null = os do plano).
alter table clientes add column if not exists preco_placa_personalizado int;
alter table clientes add column if not exists saving_bps_personalizado int;
alter table clientes drop constraint if exists clientes_preco_personalizado_check;
alter table clientes add constraint clientes_preco_personalizado_check check (
  (preco_placa_personalizado is null or preco_placa_personalizado >= 0)
  and (saving_bps_personalizado is null or saving_bps_personalizado between 0 and 10000)
);
