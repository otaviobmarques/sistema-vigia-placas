-- O Postgres concede EXECUTE a PUBLIC por padrão. As funções de escopo do RLS só servem ao papel vigia_app.
revoke execute on function app_pode_cliente(uuid), app_nivel(), app_franqueado(), app_cliente() from public;
grant execute on function app_pode_cliente(uuid), app_nivel(), app_franqueado(), app_cliente() to vigia_app;
