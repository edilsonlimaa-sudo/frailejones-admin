-- Agenda a Edge Function atualizar-cotacao-bcv via pg_cron + pg_net.
--
-- A URL do projeto vem do Vault (segredo `project_url`), pra mesma migration servir no local e
-- no remoto. Cadastre uma vez em cada ambiente:
--   local:  já criado pelo supabase/seed.sql (http://kong:8000)
--   remoto: select vault.create_secret('https://<ref>.supabase.co', 'project_url');
-- Sem o segredo, o job roda mas a chamada falha (ver cron.job_run_details).
--
-- Roda de hora em hora: nem a DolarApi nem o site do BCV informam a hora da publicação (só a
-- "fecha valor"), então a taxa nova entra no máximo 1h depois de publicada. A função só grava
-- quando o valor muda, e o created_at mostra quando o BCV publicou; com esse histórico dá pra
-- reduzir a frequência depois.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'atualizar-cotacao-bcv',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/atualizar-cotacao-bcv',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
