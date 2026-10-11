-- Seed de DEMONSTRAÇÃO: rateios extraordinários (emergências do condomínio, jan–set 2026).
-- Depende de 01_dados_mestres.sql.
--
-- Reproduz o que o app grava via salvar_rateio_extraordinario(), mas com datas históricas
-- (a função usaria data_emissao = hoje):
--   1. a despesa;
--   2. as unidades participantes;
--   3. valor_por_unidade_usd = round(total / participantes, 2), como no formulário do app;
--   4. uma cobrança por unidade participante: descricao = titulo, competencia = data_vencimento,
--      multa/juros/graça congelados da despesa. Todas nascem 'pendente' — o seed de pagamentos
--      é que vai quitá-las.
--
-- Pra editar: mude a linha da despesa e/ou a lista de unidades dela; o valor por unidade e as
-- cobranças são derivados disso, então não ficam inconsistentes.
--
-- IDs:
--   despesas_extraordinarias  d4000000-0000-0000-0000-0000000000NN   (NN = 01..05)
--   cobrancas extraordinárias d5000000-0000-0000-00NN-00000000TTAA   (NN = despesa, TTAA = unidade)
--
-- Emergências:
--   #01 fev  Bomba do hidroneumático queimada     todas (24)   US$ 1.440,00 -> 60,00
--   #02 abr  Elevador da torre 22 parado          torre 22     US$ 1.800,00 -> 150,00
--   #03 jun  Infiltrações na torre 21 (chuvas)    torre 21     US$ 1.560,00 -> 130,00
--   #04 ago  Quadro elétrico principal danificado todas (24)   US$ 1.000,00 -> 41,67 (arredonda)
--   #05 set  Motor do portão eletrônico           todas (24)   US$   720,00 -> 30,00

begin;

-- ============================================================
-- DESPESAS (valor_por_unidade_usd é recalculado mais abaixo a partir dos participantes)
-- created_at = dia em que a emergência foi cadastrada = data_emissao das cobranças
-- ============================================================
insert into despesas_extraordinarias (id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at) values
  ('d4000000-0000-0000-0000-000000000001',
   'Reemplazo de bomba del hidroneumático',
   'La bomba principal se quemó tras una falla eléctrica y el edificio quedó sin agua. Se compró e instaló una bomba nueva de 3 HP.',
   1440.00, 0, '2026-02-25', 5.00, 0.1000, 5, '2026-02-10 10:30:00-04'),
  ('d4000000-0000-0000-0000-000000000002',
   'Reparación del ascensor – Torre 22',
   'Falla en la tarjeta de control dejó el ascensor detenido 5 días. Incluye repuesto importado y mano de obra.',
   1800.00, 0, '2026-04-30', 5.00, 0.1000, 5, '2026-04-14 16:00:00-04'),
  ('d4000000-0000-0000-0000-000000000003',
   'Impermeabilización de emergencia – Torre 21',
   'Filtraciones en la azotea durante las lluvias afectaron los apartamentos del último piso. Se impermeabilizó la losa completa.',
   1560.00, 0, '2026-06-23', 5.00, 0.1000, 5, '2026-06-08 11:15:00-04'),
  ('d4000000-0000-0000-0000-000000000004',
   'Reparación del tablero eléctrico principal',
   'Un bajón de tensión dañó breakers y cableado del tablero principal, dejando sin luz las áreas comunes.',
   1000.00, 0, '2026-08-18', 5.00, 0.1000, 5, '2026-08-03 09:45:00-04'),
  ('d4000000-0000-0000-0000-000000000005',
   'Motor del portón eléctrico',
   'El motor del portón vehicular dejó de funcionar y el acceso quedó abierto. Se reemplazaron el motor y la cremallera.',
   720.00, 0, '2026-09-30', 5.00, 0.1000, 5, '2026-09-15 14:20:00-04');

-- ============================================================
-- UNIDADES PARTICIPANTES (por identificação; tire/ponha unidades editando a lista)
-- ============================================================
-- #01 Bomba do hidroneumático: todas
insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
select 'd4000000-0000-0000-0000-000000000001', u.id from unidades u where u.identificacao in (
  '21-01','21-02','21-03','21-04','21-05','21-06','21-07','21-08','21-09','21-10','21-11','21-12',
  '22-01','22-02','22-03','22-04','22-05','22-06','22-07','22-08','22-09','22-10','22-11','22-12'
);

-- #02 Elevador: só torre 22
insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
select 'd4000000-0000-0000-0000-000000000002', u.id from unidades u where u.identificacao in (
  '22-01','22-02','22-03','22-04','22-05','22-06','22-07','22-08','22-09','22-10','22-11','22-12'
);

-- #03 Impermeabilização: só torre 21
insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
select 'd4000000-0000-0000-0000-000000000003', u.id from unidades u where u.identificacao in (
  '21-01','21-02','21-03','21-04','21-05','21-06','21-07','21-08','21-09','21-10','21-11','21-12'
);

-- #04 Quadro elétrico: todas
insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
select 'd4000000-0000-0000-0000-000000000004', u.id from unidades u where u.identificacao in (
  '21-01','21-02','21-03','21-04','21-05','21-06','21-07','21-08','21-09','21-10','21-11','21-12',
  '22-01','22-02','22-03','22-04','22-05','22-06','22-07','22-08','22-09','22-10','22-11','22-12'
);

-- #05 Portão: todas
insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
select 'd4000000-0000-0000-0000-000000000005', u.id from unidades u where u.identificacao in (
  '21-01','21-02','21-03','21-04','21-05','21-06','21-07','21-08','21-09','21-10','21-11','21-12',
  '22-01','22-02','22-03','22-04','22-05','22-06','22-07','22-08','22-09','22-10','22-11','22-12'
);

-- ============================================================
-- VALOR POR UNIDADE (derivado, igual ao formulário do app: total / participantes, 2 casas)
-- ============================================================
update despesas_extraordinarias d
   set valor_por_unidade_usd = round(d.valor_total_usd / p.qtd, 2)
  from (
    select despesa_extraordinaria_id, count(*) as qtd
      from despesa_extraordinaria_unidades
     group by despesa_extraordinaria_id
  ) p
 where p.despesa_extraordinaria_id = d.id
   and d.id::text like 'd4000000-%';

-- ============================================================
-- COBRANÇAS EXTRAORDINÁRIAS (derivadas, mesmos campos que salvar_rateio_extraordinario grava)
-- ============================================================
insert into cobrancas (
  id, unidade_id, tipo, descricao, competencia, valor_usd, data_emissao, data_vencimento,
  pct_multa_atraso, pct_juros_diario, dias_graca, status, despesa_extraordinaria_id, created_at
)
select
  ('d5000000-0000-0000-' || right(d.id::text, 4) || '-' || right(u.id::text, 12))::uuid,
  u.id, 'extraordinaria', d.titulo, d.data_vencimento, d.valor_por_unidade_usd,
  d.created_at::date, d.data_vencimento,
  d.pct_multa_atraso, d.pct_juros_diario, d.dias_graca, 'pendente', d.id, d.created_at
from despesas_extraordinarias d
join despesa_extraordinaria_unidades deu on deu.despesa_extraordinaria_id = d.id
join unidades u on u.id = deu.unidade_id
where d.id::text like 'd4000000-%';

-- Conferência (esperado: 5 despesas / 96 participantes / 96 cobranças)
select d.titulo, d.valor_total_usd, d.valor_por_unidade_usd, count(c.id) as cobrancas
  from despesas_extraordinarias d
  left join cobrancas c on c.despesa_extraordinaria_id = d.id
 where d.id::text like 'd4000000-%'
 group by d.id
 order by d.data_vencimento;

commit;
