select
  (select count(*) from supabase_migrations.schema_migrations where version like '202610061%') as migrations_registradas,
  (select schedule from cron.job where jobname = 'atualizar-cotacao-bcv') as agendamento,
  (select count(*) from vault.secrets where name = 'project_url') as url_no_vault,
  (select prosrc ~ 'c_sobra_minima_usd' from pg_proc where proname = 'liquidar_cobranca') as minimo_ativo;