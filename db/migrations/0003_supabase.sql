-- Supabase expõe o schema public pela API REST (PostgREST) para os papéis anon/authenticated.
-- O Vigia Placa não usa essa API: acessa o Postgres direto, com RLS por papel (0002).
-- Fecha o acesso REST para que nenhuma tabela fique legível por ali. No PGlite os papéis não existem e nada acontece.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

-- Tabela de controle das migrações também com RLS (sem políticas = ninguém além do dono lê).
alter table if exists schema_migrations enable row level security;
