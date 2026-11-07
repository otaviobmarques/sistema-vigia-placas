-- Isolamento por linha (seção 5). A aplicação abre cada requisição com
--   SET LOCAL ROLE vigia_app; set_config('app.nivel'|'app.franqueado_id'|'app.cliente_id', ..., true)
-- e o banco só devolve as linhas do ramo do usuário.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vigia_app') then
    create role vigia_app nologin;
  end if;
end $$;
grant vigia_app to current_user;
grant usage on schema public to vigia_app;
grant select, insert, update, delete on all tables in schema public to vigia_app;

create or replace function app_nivel() returns text language sql stable set search_path = public as
$$ select coalesce(nullif(current_setting('app.nivel', true), ''), 'nenhum') $$;
create or replace function app_franqueado() returns uuid language sql stable set search_path = public as
$$ select nullif(current_setting('app.franqueado_id', true), '')::uuid $$;
create or replace function app_cliente() returns uuid language sql stable set search_path = public as
$$ select nullif(current_setting('app.cliente_id', true), '')::uuid $$;

-- security definer: consulta clientes sem passar pelo RLS (evita recursão).
create or replace function app_pode_cliente(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case app_nivel()
    when 'franqueadora' then true
    when 'franqueado' then exists (select 1 from clientes c where c.id = cid and c.franqueado_id = app_franqueado())
    when 'cliente' then cid = app_cliente()
    else false end
$$;
grant execute on function app_pode_cliente(uuid), app_nivel(), app_franqueado(), app_cliente() to vigia_app;

do $$
declare t text;
begin
  foreach t in array array['placas','multas','eventos','carrinho_itens','pagamentos','pagamento_itens','economias',
                           'faturas','pedidos_defesa','consultas','notificacoes_capturadas','outbox','alertas_enviados','condutores']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy isolamento on %I using (app_pode_cliente(cliente_id)) with check (app_pode_cliente(cliente_id))', t);
  end loop;
end $$;

alter table clientes enable row level security;
create policy isolamento on clientes using (app_pode_cliente(id))
  with check (app_nivel() = 'franqueadora' or (app_nivel() = 'franqueado' and franqueado_id = app_franqueado()) or id = app_cliente());

alter table franqueados enable row level security;
create policy leitura on franqueados for select using (
  app_nivel() = 'franqueadora' or id = app_franqueado()
  or (app_nivel() = 'cliente' and id = (select franqueado_id from clientes where id = app_cliente())));
create policy escrita on franqueados for all using (app_nivel() = 'franqueadora') with check (app_nivel() = 'franqueadora');

alter table usuarios enable row level security;
create policy isolamento on usuarios using (
  app_nivel() = 'franqueadora'
  or (app_nivel() = 'franqueado' and (franqueado_id = app_franqueado() or (cliente_id is not null and app_pode_cliente(cliente_id))))
  or (app_nivel() = 'cliente' and cliente_id = app_cliente()));

alter table auditoria enable row level security;
create policy leitura on auditoria for select using (app_nivel() = 'franqueadora' or (cliente_id is not null and app_pode_cliente(cliente_id)));
create policy escrita on auditoria for insert with check (true);

-- Tabelas de referência: todos leem, só a franqueadora altera.
do $$
declare t text;
begin
  foreach t in array array['configuracao','planos','orgaos','fontes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy leitura on %I for select using (true)', t);
    execute format('create policy escrita on %I for all using (app_nivel() = ''franqueadora'') with check (app_nivel() = ''franqueadora'')', t);
  end loop;
end $$;
