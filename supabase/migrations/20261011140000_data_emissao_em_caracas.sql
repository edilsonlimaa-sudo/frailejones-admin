-- data_emissao passa a ser o dia da emissão em Caracas.
--
-- O default era current_date, que usa o fuso da sessão do Postgres (UTC no Supabase): cobranças
-- emitidas das 20h à meia-noite em Caracas ficavam com a data do dia seguinte. As funções de
-- emissão (emitir_cobrancas_taxa, salvar_rateio_extraordinario) não informam a coluna e dependem
-- deste default. Cobranças já gravadas não são corrigidas: o campo é informativo e não dá pra
-- distinguir com segurança as emitidas à noite das que tiveram a data informada à mão (seeds).

alter table cobrancas
  alter column data_emissao set default (now() at time zone 'America/Caracas')::date;
