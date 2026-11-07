-- Planos editáveis no backoffice e exibidos no site de vendas.
-- saving_bps por plano (null = usa o saving global da configuração); textos e destaque do site.
alter table planos add column if not exists saving_bps int;
alter table planos add column if not exists frase_site text not null default '';
alter table planos add column if not exists itens_site text not null default '';
alter table planos add column if not exists destaque_site boolean not null default false;
alter table planos drop constraint if exists planos_saving_check;
alter table planos add constraint planos_saving_check check (saving_bps is null or saving_bps between 0 and 10000);

update planos set saving_bps = 2500, frase_site = 'Para quem quer parar de perder desconto e prazo.',
  itens_site = E'Tela Faça hoje com o que vence primeiro\nAlertas de prazo por e-mail e no celular\nPagamento com o maior desconto disponível\nExtrato de Economia mensal'
  where id = 'essencial' and itens_site = '';
update planos set saving_bps = 2000, destaque_site = true, frase_site = 'Para frotas que querem zerar a multa NIC.',
  itens_site = E'Tudo do Essencial\nAlertas no WhatsApp\nIndicação de condutor assistida\nTodas as multas pagas num Pix só\nLeitura automática de notificações (foto ou PDF)'
  where id = 'profissional' and itens_site = '';
update planos set saving_bps = 1500, frase_site = 'Para operações em que cada placa conta todo dia.',
  itens_site = E'Tudo do Profissional\nCentros de custo e relatórios exportáveis\nGestão de condutores, CNH e toxicológico\nAnálise de defesa e recursos\nSuporte prioritário'
  where id = 'frota' and itens_site = '';
