-- Acesso gov.br por cliente: procuração (a Vigia Placa acessa como procuradora) ou login gov.br do próprio cliente.
-- Ordem de uso: procuração válida → gov.br do cliente → login próprio do SIFAMA (só ANTT). Senhas cifradas com AES-256-GCM.
alter table clientes add column if not exists procuracao_gov boolean not null default false;
alter table clientes add column if not exists procuracao_validade date;
alter table clientes add column if not exists gov_login text;
alter table clientes add column if not exists gov_senha_cifrada text;
-- Puxar multas e notificações pelo SENATRAN (SNE) com o acesso gov.br.
alter table clientes add column if not exists gov_multas_ativo boolean not null default true;
alter table clientes add column if not exists gov_ultimo_erro text;

-- Procurador gov.br da Vigia Placa (um só, vale para todos os clientes com procuração).
alter table configuracao add column if not exists procurador_cpf text;
alter table configuracao add column if not exists procurador_senha_cifrada text;

-- Chave da infração no SENATRAN (baixa a notificação e o boleto com desconto do SNE).
alter table multas add column if not exists chave_infracao text;

-- Novos documentos: notificação baixada do SNE e o PDF da procuração (fica até a validade).
alter table documentos drop constraint if exists documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in ('boleto', 'auto_antt', 'boleto_antt', 'notificacao_sne', 'procuracao'));
