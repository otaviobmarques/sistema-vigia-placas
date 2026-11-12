-- Reprocessamento de placas: quando a equipe pediu a nova consulta (separa "na fila" de "parada").
alter table placas add column if not exists reprocessar_em timestamptz;
create index if not exists consultas_placa_data on consultas (placa_id, data desc);
