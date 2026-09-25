DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Garante as permissões padrão para o esquema público
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ATENÇÃO: apaga TODAS as tabelas, tipos e dados do schema public. Só rodar em dev.
-- Depois de rodar isto, rode o conteúdo de supabase/migrations/20260923120000_init_schema.sql.

drop schema public cascade;
create schema public;

-- reaplica os privilégios padrão do Supabase (somem quando o schema é dropado),
-- incluindo os default privileges pra tabelas futuras herdarem o grant automaticamente
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;