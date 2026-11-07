-- Dados de referência necessários em qualquer ambiente (produção inclusive). Valores de partida, editáveis no backoffice.
insert into configuracao (id) values (1) on conflict do nothing;
insert into planos (id, nome, frequencia, preco_placa, consultas_avulsas, inclui, whatsapp, pix_unico) values
  ('essencial','Essencial','semanal',590,3,'Faça hoje, prazos, alertas por e-mail, Extrato de Economia',false,false),
  ('profissional','Profissional','adaptativa',990,10,'Essencial + WhatsApp, Pix único, indicação assistida, captura de notificações',true,true),
  ('frota','Frota','diaria',2990,30,'Profissional + centros de custo, relatórios, condutores, prioridade no suporte',true,true)
on conflict (id) do nothing;
insert into fontes (id, nome, ativa, prioridade, custo) values
  ('infosimples','Infosimples',true,1,20),
  ('senatran','Consulta Online Senatran (aguardando autorização)',false,2,91),
  ('captura','Captura de notificações',true,9,0)
on conflict (id) do nothing;
insert into orgaos (id, nome, uf, esfera, aderente_sne, coberto) values
  ('BHTRANS','BHTrans','MG','municipal',true,true),
  ('DETRAN-MG','Detran-MG','MG','estadual',true,true),
  ('DER-MG','DER-MG','MG','estadual',true,true),
  ('PREF-CONTAGEM','Prefeitura de Contagem','MG','municipal',false,false),
  ('CET-SP','CET São Paulo','SP','municipal',true,true)
on conflict (id) do nothing;
