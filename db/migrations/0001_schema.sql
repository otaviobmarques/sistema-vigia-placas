-- Vigia Placa · schema principal (Postgres / Supabase)
-- Valores monetários em centavos (integer). Percentuais em pontos base (2000 = 20%).

create table configuracao (
  id int primary key default 1 check (id = 1),
  saving_bps int not null default 2000,
  taxa_conv_tipo text not null default 'fixa' check (taxa_conv_tipo in ('fixa','percentual')),
  taxa_conv_valor int not null default 490,
  preco_defesa int not null default 14900,
  custo_consulta int not null default 20,
  termo_versao text not null default '2026-11-v1'
);

create table planos (
  id text primary key,
  nome text not null,
  frequencia text not null,
  preco_placa int,            -- null = [DEFINIR]
  consultas_avulsas int not null default 5,
  inclui text not null default '',
  whatsapp boolean not null default false,
  pix_unico boolean not null default false
);

create table franqueados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text not null unique,
  cidade text,
  asaas_wallet_id text,
  repasse_mensalidade_bps int not null default 3000,
  repasse_saving_bps int not null default 3000,
  repasse_conveniencia_bps int not null default 3000,
  comissao_defesa_bps int not null default 1000,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  franqueado_id uuid references franqueados(id),
  tipo text not null check (tipo in ('PF','PJ')),
  documento text not null unique,
  nome text not null,
  segmento text,
  email text,
  whatsapp text,
  endereco text,
  resp_financeiro text,
  forma_cobranca text not null default 'pix' check (forma_cobranca in ('pix','boleto','cartao')),
  plano_id text not null references planos(id),
  frequencia_padrao text not null default 'adaptativa',
  aceite_em timestamptz,
  aceite_ip text,
  aceite_versao text,
  -- Configurações (seção 7)
  franqueado_pode_agir boolean not null default false,
  aprovacao_dupla_acima int,
  pagamento_auto_ate int,
  pagamento_auto boolean not null default false,
  alertas_canais text[] not null default '{whatsapp,email}',
  alertas_antecedencias int[] not null default '{15,7,3,1}',
  resumo text not null default 'semanal',
  envio_auto_link_condutor boolean not null default true,
  rateio text not null default 'nenhum',
  saving_teto int,
  asaas_customer_id text,
  consultas_avulsas_usadas int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  senha_hash text not null,
  nivel text not null check (nivel in ('franqueadora','franqueado','cliente')),
  franqueado_id uuid references franqueados(id),
  cliente_id uuid references clientes(id),
  perfil text not null default 'admin' check (perfil in ('admin','gestor','financeiro','leitura')),
  totp_secret text,
  criado_em timestamptz not null default now()
);

create table condutores (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  nome text not null,
  cpf text,
  cnh text,
  whatsapp text,
  email text,
  pontos_12m int not null default 0,
  gravissimas_12m int not null default 0,
  criado_em timestamptz not null default now()
);

create table orgaos (
  id text primary key,
  nome text not null,
  uf text not null,
  esfera text not null default 'municipal',
  aderente_sne boolean not null default true,
  coberto boolean not null default true
);

create table fontes (
  id text primary key,
  nome text not null,
  ativa boolean not null default true,
  prioridade int not null default 1,
  custo int not null default 20,
  falhas_seguidas int not null default 0,
  ultima_falha text,
  desligada_em timestamptz
);

create table placas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  placa text not null,
  renavam text not null,
  uf text not null,
  apelido text,
  grupo text,
  centro_custo text,
  modelo text,
  chassi text,
  condutor_principal_id uuid references condutores(id),
  status text not null default 'aguardando' check (status in ('ativa','pausada','aguardando','erro')),
  motivo_pausa text,
  frequencia text,
  sne_adesao_em date,
  ultima_verificacao timestamptz,
  proxima_verificacao date,
  criado_em timestamptz not null default now()
);
-- A mesma placa não fica ativa em dois clientes.
create unique index placas_unica_ativa on placas (placa) where status <> 'pausada';
create index placas_cliente on placas (cliente_id);

create table multas (
  id uuid primary key default gen_random_uuid(),
  placa_id uuid not null references placas(id),
  cliente_id uuid not null references clientes(id),
  orgao_id text not null references orgaos(id),
  auto_infracao text not null,
  codigo_infracao text not null,
  descricao text not null,
  gravidade text not null,
  pontos int not null,
  valor int not null,
  data_infracao date not null,
  hora text,
  local text,
  estado text not null default 'detectada',
  detectada_em date not null default current_date,
  fonte text not null,
  notificada_em date,
  vencimento date,
  condutor_id uuid references condutores(id),
  indicacao_status text check (indicacao_status in ('enviada','aceita','protocolada','recusada')),
  indicacao_token text unique,
  indicacao_aceite_em timestamptz,
  cnh_arquivo text,
  protocolo_indicacao text,
  linha_digitavel text,
  criado_em timestamptz not null default now(),
  unique (orgao_id, auto_infracao, codigo_infracao)
);
create index multas_cliente on multas (cliente_id, estado);

create table eventos (
  id uuid primary key default gen_random_uuid(),
  multa_id uuid not null references multas(id),
  cliente_id uuid not null references clientes(id),
  tipo text not null,
  descricao text not null,
  data timestamptz not null default now(),
  fonte text,
  usuario_id uuid
);

create table carrinho_itens (
  cliente_id uuid not null references clientes(id),
  multa_id uuid not null references multas(id),
  primary key (cliente_id, multa_id)
);

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  franqueado_id uuid references franqueados(id),
  asaas_id text unique,
  status text not null default 'aguardando' check (status in ('aguardando','pago','quitado','parcial','cancelado')),
  multas_valor int not null,
  taxa int not null,
  total int not null,
  economia int not null,
  split_franqueado int not null default 0,
  pix_payload text,
  pix_qr text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  pago_em timestamptz
);

create table pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references pagamentos(id),
  cliente_id uuid not null references clientes(id),
  multa_id uuid not null references multas(id),
  valor_cheio int not null,
  a_pagar int not null,
  desconto text,
  boleto_status text not null default 'pendente' check (boleto_status in ('pendente','pago','falha','devolvido')),
  parceiro text,
  comprovante text
);

create table economias (
  id uuid primary key default gen_random_uuid(),
  multa_id uuid not null references multas(id),
  cliente_id uuid not null references clientes(id),
  tipo text not null check (tipo in ('desconto','nic_evitada','cancelamento')),
  valor int not null,
  comprovada boolean not null,
  mes text not null,
  descricao text not null,
  criado_em timestamptz not null default now(),
  unique (multa_id, tipo)
);

create table faturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  franqueado_id uuid references franqueados(id),
  mes text not null,
  placas int not null,
  mensalidades int not null,
  saving int not null,
  base_saving int not null,
  conveniencia int not null,
  defesa int not null,
  split_franqueado int not null,
  total int not null,
  status text not null default 'aberta' check (status in ('aberta','emitida','paga','cancelada')),
  asaas_id text,
  criado_em timestamptz not null default now(),
  unique (cliente_id, mes)
);

create table pedidos_defesa (
  id uuid primary key default gen_random_uuid(),
  multa_id uuid not null references multas(id),
  cliente_id uuid not null references clientes(id),
  preco int not null,
  status text not null default 'aguardando_pagamento' check (status in ('aguardando_pagamento','em_andamento','deferida','indeferida')),
  responsavel text,
  protocolo text,
  resultado text,
  criado_em timestamptz not null default now()
);

create table consultas (
  id uuid primary key default gen_random_uuid(),
  placa_id uuid not null references placas(id),
  cliente_id uuid not null references clientes(id),
  fonte_id text not null references fontes(id),
  data timestamptz not null default now(),
  custo int not null,
  resultado text not null check (resultado in ('ok','erro')),
  multas_encontradas int not null default 0,
  erro text,
  avulsa boolean not null default false
);
create index consultas_data on consultas (data);

create table notificacoes_capturadas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id),
  origem text not null check (origem in ('foto','pdf','email')),
  arquivo_nome text,
  arquivo_tipo text,
  arquivo_base64 text,
  dados jsonb not null default '{}',
  multa_id uuid references multas(id),
  achada_antes boolean,
  orgao_id text references orgaos(id),
  criado_em timestamptz not null default now()
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  canal text not null check (canal in ('whatsapp','email','push')),
  destino text not null,
  assunto text not null,
  corpo text not null,
  status text not null default 'pendente',
  criado_em timestamptz not null default now()
);

create table alertas_enviados (
  multa_id uuid not null references multas(id),
  prazo text not null,
  antecedencia int not null,
  cliente_id uuid not null references clientes(id),
  enviado_em timestamptz not null default now(),
  primary key (multa_id, prazo, antecedencia)
);

create table auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid,
  cliente_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id text,
  dados jsonb,
  data timestamptz not null default now()
);
