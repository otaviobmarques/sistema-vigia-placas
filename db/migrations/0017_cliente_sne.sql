-- Cliente (proprietário) cadastrado no SNE: as multas dele podem ter 40% de desconto (CTB art. 284, § 1º).
alter table clientes add column if not exists sne_cadastrado boolean not null default false;
alter table clientes add column if not exists sne_desde date;
