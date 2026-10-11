-- Seed de DEMONSTRAÇÃO: emissão mensal das taxas recorrentes (Cuota Ordinaria e Fondo de
-- Reserva), competências jan–set 2026. Depende de 01_dados_mestres.sql.
--
-- Reproduz o que o app grava via emitir_cobrancas_taxa() (botão "Emitir cobranças do mês"),
-- mas com datas históricas (a função usaria data_emissao = hoje):
--   1. uma cobrança por unidade vinculada à taxa, por competência: descricao 'Taxa de
--      condomínio' (texto fixo da função), valor e multa/juros/graça congelados da taxa,
--      vencimento no dia_vencimento da taxa dentro do mês da competência;
--   2. o fechamento da competência (faturamentos_competencia) com a quantidade emitida.
-- Todas nascem 'pendente' — o seed de pagamentos é que vai quitá-las.
--
-- Pra editar: mude a lista de competências abaixo (tirar um mês = aquele mês não foi emitido;
-- mudar a data = emissão em outro dia). Valores e unidades vêm da taxa e dos vínculos do seed 01.
--
-- IDs:
--   cobrancas ordinárias      d6000000-0000-0000-NNMM-00000000TTAA   (NN = taxa, MM = mês, TTAA = unidade)
--   faturamentos_competencia  d7000000-0000-0000-0000-00000000NNMM
--
-- Esperado: 2 taxas x 9 meses = 18 fechamentos; 18 x 24 unidades = 432 cobranças.

begin;

-- ============================================================
-- COMPETÊNCIAS EMITIDAS (emissão no dia 1 do próprio mês)
-- ============================================================
create temp table demo_competencias (
  competencia date primary key,
  data_processamento timestamptz not null
) on commit drop;

insert into demo_competencias (competencia, data_processamento) values
  ('2026-01-01', '2026-01-01 08:30:00-04'),
  ('2026-02-01', '2026-02-01 08:30:00-04'),
  ('2026-03-01', '2026-03-01 08:30:00-04'),
  ('2026-04-01', '2026-04-01 08:30:00-04'),
  ('2026-05-01', '2026-05-01 08:30:00-04'),
  ('2026-06-01', '2026-06-01 08:30:00-04'),
  ('2026-07-01', '2026-07-01 08:30:00-04'),
  ('2026-08-01', '2026-08-01 08:30:00-04'),
  ('2026-09-01', '2026-09-01 08:30:00-04');

-- ============================================================
-- COBRANÇAS ORDINÁRIAS (derivadas, mesmos campos que emitir_cobrancas_taxa grava)
-- vencimento = dia_vencimento da taxa, limitado ao último dia do mês (ex.: 31 em fevereiro -> 28)
-- ============================================================
insert into cobrancas (
  id, unidade_id, tipo, descricao, competencia, valor_usd, data_emissao, data_vencimento,
  pct_multa_atraso, pct_juros_diario, dias_graca, status, taxa_condominio_id, created_at
)
select
  ('d6000000-0000-0000-' || right(t.id::text, 2) || to_char(dc.competencia, 'MM') || '-' || right(tcu.unidade_id::text, 12))::uuid,
  tcu.unidade_id, 'ordinaria', 'Taxa de condomínio', dc.competencia, t.valor_usd,
  dc.data_processamento::date,
  least(
    dc.competencia + (t.dia_vencimento - 1),
    (dc.competencia + interval '1 month' - interval '1 day')::date
  ),
  t.pct_multa_atraso, t.pct_juros_diario, t.dias_graca, 'pendente', t.id, dc.data_processamento
from demo_competencias dc
cross join taxa_condominio t
join taxa_condominio_unidades tcu on tcu.taxa_condominio_id = t.id
where t.id::text like 'd3000000-%'
  and t.ativo;

-- ============================================================
-- FECHAMENTO DAS COMPETÊNCIAS (quantidade = cobranças emitidas acima)
-- ============================================================
insert into faturamentos_competencia (id, taxa_condominio_id, competencia, quantidade_unidades_faturadas, data_processamento, created_at)
select
  ('d7000000-0000-0000-0000-00000000' || right(t.id::text, 2) || to_char(dc.competencia, 'MM'))::uuid,
  t.id, dc.competencia, count(c.id), dc.data_processamento, dc.data_processamento
from demo_competencias dc
cross join taxa_condominio t
join cobrancas c on c.taxa_condominio_id = t.id and c.competencia = dc.competencia
where t.id::text like 'd3000000-%'
group by t.id, dc.competencia, dc.data_processamento;

-- Conferência (esperado: 18 linhas, 24 unidades cada, vencimento dia 5)
select t.titulo, fc.competencia, fc.quantidade_unidades_faturadas,
       min(c.data_vencimento) as vencimento, sum(c.valor_usd) as total_usd
  from faturamentos_competencia fc
  join taxa_condominio t on t.id = fc.taxa_condominio_id
  join cobrancas c on c.taxa_condominio_id = fc.taxa_condominio_id and c.competencia = fc.competencia
 where fc.id::text like 'd7000000-%'
 group by t.titulo, fc.competencia, fc.quantidade_unidades_faturadas
 order by fc.competencia, t.titulo;

commit;
