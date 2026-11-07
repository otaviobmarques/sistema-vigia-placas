-- Gestão de usuários e aprovação dupla de pagamentos.

alter table usuarios add column if not exists trocar_senha boolean not null default false;
alter table usuarios add column if not exists ativo boolean not null default true;

alter table pagamentos drop constraint if exists pagamentos_status_check;
alter table pagamentos add constraint pagamentos_status_check
  check (status in ('aguardando_aprovacao','aguardando','pago','quitado','parcial','cancelado'));
alter table pagamentos add column if not exists aprovado_por uuid;
alter table pagamentos add column if not exists aprovado_em timestamptz;

-- Usuários: leitura e escrita com regras separadas. Na escrita, ninguém cria ou promove
-- alguém acima do próprio nível (um franqueado nunca grava um usuário "franqueadora").
drop policy if exists isolamento on usuarios;
create policy leitura on usuarios for select using (
  app_nivel() = 'franqueadora'
  or (app_nivel() = 'franqueado' and (franqueado_id = app_franqueado() or (cliente_id is not null and app_pode_cliente(cliente_id))))
  or (app_nivel() = 'cliente' and cliente_id = app_cliente()));

create or replace function app_pode_gravar_usuario(u_nivel text, u_franqueado uuid, u_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_nivel()
    when 'franqueadora' then true
    when 'franqueado' then
      (u_nivel = 'franqueado' and u_franqueado = app_franqueado() and u_cliente is null)
      or (u_nivel = 'cliente' and u_cliente is not null and app_pode_cliente(u_cliente) and u_franqueado is null)
    when 'cliente' then u_nivel = 'cliente' and u_cliente = app_cliente() and u_franqueado is null
    else false end
$$;
revoke execute on function app_pode_gravar_usuario(text, uuid, uuid) from public;
grant execute on function app_pode_gravar_usuario(text, uuid, uuid) to vigia_app;

create policy insercao on usuarios for insert with check (app_pode_gravar_usuario(nivel, franqueado_id, cliente_id));
create policy alteracao on usuarios for update
  using (app_pode_gravar_usuario(nivel, franqueado_id, cliente_id))
  with check (app_pode_gravar_usuario(nivel, franqueado_id, cliente_id));
