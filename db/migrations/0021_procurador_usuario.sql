-- Procurador gov.br por usuário da equipe: cada procurador (ex.: o Gestor) cadastra o próprio gov.br em "Minha conta".
-- O cliente diz para qual procurador deu a procuração. O procurador do Backoffice continua como padrão.
alter table usuarios add column if not exists gov_cpf text;
alter table usuarios add column if not exists gov_senha_cifrada text;
alter table clientes add column if not exists procurador_usuario_id uuid references usuarios(id) on delete set null;
