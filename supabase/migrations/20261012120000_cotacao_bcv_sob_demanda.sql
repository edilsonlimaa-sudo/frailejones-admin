-- Cotação BCV atualizada pelo próprio app, sem pg_cron.
--
-- O cron dependia do segredo `project_url` no Vault do remoto e falhava em silêncio quando ele
-- faltava. Agora o servidor Next, ao renderizar uma tela que usa a cotação, confere se a vigente
-- está em dia (lib/cotacao-bcv.ts) e, se não estiver, chama a Edge Function atualizar-cotacao-bcv.
--
-- cotacao_bcv_consulta guarda quando a fonte foi consultada pela última vez: em feriado o BCV não
-- publica e a cotação "atrasada" é a correta, então sem esse registro cada página aberta no dia
-- consultaria a fonte de novo. Uma linha só (id = true), gravada pela Edge Function.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'atualizar-cotacao-bcv') then
    perform cron.unschedule('atualizar-cotacao-bcv');
  end if;
end;
$$;

create table cotacao_bcv_consulta (
  id boolean primary key default true check (id),
  consultado_em timestamptz not null default now(),
  -- motivo da última falha (fontes fora do ar, variação suspeita); null quando deu certo
  erro text
);
