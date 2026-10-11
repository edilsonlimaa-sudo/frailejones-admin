-- Seed de DEMONSTRAÇÃO: pagamentos das cobranças (jan–set 2026).
-- Depende de 01 (unidades), 02 e 03 (cobranças) e 04 (cotações BCV).
--
-- Cada pagamento é registrado pela função do app liquidar_cobranca() — a mesma do modal de
-- liquidação —, então alocação (encargos primeiro, depois principal), status da cobrança e
-- câmbio congelado saem exatamente como o app gravaria. Multa/juros e cotação BCV (a vigente no
-- dia, ou a anterior mais próxima em fim de semana) são calculados pela própria função na data do
-- pagamento. O script só calcula o valor exato devido nesse dia, como o modal sugere:
--   - encargos do dia: calcular_encargos_cobranca(), a mesma função que liquidar_cobranca usa;
--   - em VES, o mesmo total convertido pela cotação vigente no dia;
--   - created_at do pagamento = data do pagamento (a função grava now()).
--
-- SEM SALDO A FAVOR: todo pagamento é no valor exato devido (ou menor, nos abonos parciais), então
-- liquidar_cobranca nunca gera ENTRADA de crédito. O script falha se algum crédito for criado.
-- Pagamentos que cairiam depois de 30/09/2026 ficam de fora (a cobrança continua pendente).
--
-- Pra editar:
--   1. PERFIS: comportamento de cada unidade (uma linha por unidade);
--   2. PAGAMENTOS ESPECÍFICOS: substituem a regra do perfil pra uma cobrança específica
--      (abonos parciais, um atraso pontual, "não pagou").
--
-- Regras dos perfis (n = número do apto, 1..12, só pra espalhar os dias entre as unidades):
--   pontual       ordinária paga entre o dia 1 e o 5 (dia 1 + n % 5); extraordinária paga
--                 2 a 7 dias depois do cadastro do rateio. Sempre antes do vencimento.
--   atrasador     como pontual, mas nos meses_atraso (mês do VENCIMENTO) paga dias_atraso dias
--                 depois do vencimento, com multa e juros.
--   lote          junta tudo e paga nas datas_lote: cada cobrança é paga na primeira data de
--                 lote igual ou posterior à emissão. Sem data de lote depois = fica pendente.
--   cronico       pontual até parar: cobranças com vencimento antes do corte são pagas, as
--                 demais ficam pendentes.
--   ignora_extra  pontual nas ordinárias, nunca paga rateio extraordinário.
--   parcelador    pontual; os abonos ficam em PAGAMENTOS ESPECÍFICOS.

begin;

-- ============================================================
-- 1. PERFIS
-- moeda/forma: VES = pago_movil | transferencia; USD = zelle | efectivo_usd
-- ============================================================
create temp table demo_perfis (
  identificacao text primary key,
  perfil text not null check (perfil in ('pontual', 'atrasador', 'lote', 'cronico', 'ignora_extra', 'parcelador')),
  moeda moeda_tipo not null,
  forma forma_pagamento_tipo not null,
  meses_atraso int[],   -- atrasador
  dias_atraso int,      -- atrasador
  datas_lote date[],    -- lote
  corte date            -- cronico
) on commit drop;

insert into demo_perfis (identificacao, perfil, moeda, forma, meses_atraso, dias_atraso, datas_lote, corte) values
  ('21-01', 'pontual',      'USD', 'zelle',         null,      null, null, null),  -- José Gregorio
  ('21-02', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- María Alejandra
  ('21-03', 'atrasador',    'VES', 'pago_movil',    '{3,6,8}', 22,   null, null),  -- Carmen
  ('21-04', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- Luis Alberto
  ('21-05', 'pontual',      'USD', 'zelle',         null,      null, null, null),  -- Daniela
  ('21-06', 'lote',         'VES', 'transferencia', null,      null, '{2026-03-20,2026-06-19,2026-09-18}', null),  -- Pedro Antonio
  ('21-07', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- Yusbelis
  ('21-08', 'pontual',      'USD', 'efectivo_usd',  null,      null, null, null),  -- Manuel Gonçalves
  ('21-09', 'pontual',      'USD', 'efectivo_usd',  null,      null, null, null),  -- Manuel Gonçalves
  ('21-10', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- Andreína
  ('21-11', 'cronico',      'VES', 'pago_movil',    null,      null, null, '2026-05-01'),  -- Jesús Eduardo
  ('21-12', 'atrasador',    'VES', 'pago_movil',    '{2,5,9}', 18,   null, null),  -- Gabriela
  ('22-01', 'pontual',      'VES', 'transferencia', null,      null, null, null),  -- Ricardo
  ('22-02', 'pontual',      'USD', 'zelle',         null,      null, null, null),  -- Oriana
  ('22-03', 'ignora_extra', 'USD', 'zelle',         null,      null, null, null),  -- Rafael Mendoza
  ('22-04', 'ignora_extra', 'USD', 'zelle',         null,      null, null, null),  -- Rafael Mendoza
  ('22-05', 'lote',         'USD', 'efectivo_usd',  null,      null, '{2026-02-27,2026-04-30,2026-06-30,2026-08-31}', null),  -- Héctor
  ('22-06', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- Mariela
  ('22-07', 'atrasador',    'VES', 'pago_movil',    '{3,6,8}', 22,   null, null),  -- Carmen
  ('22-08', 'parcelador',   'USD', 'zelle',         null,      null, null, null),  -- Carlos Eduardo
  ('22-09', 'pontual',      'VES', 'pago_movil',    null,      null, null, null),  -- Valentina
  ('22-10', 'pontual',      'USD', 'zelle',         null,      null, null, null),  -- Juan Camilo
  ('22-11', 'cronico',      'VES', 'transferencia', null,      null, null, '2026-07-01'),  -- Ana Teresa
  ('22-12', 'atrasador',    'VES', 'pago_movil',    '{3,6,8}', 22,   null, null);  -- Carmen

-- ============================================================
-- 2. PAGAMENTOS ESPECÍFICOS (substituem a regra do perfil pra cobrança indicada)
-- origem: 'cuota' (Cuota Ordinaria) | 'fondo' (Fondo de Reserva) | 'extra' (rateio)
-- mes: mês do VENCIMENTO da cobrança (cada rateio vence num mês diferente)
-- valor_usd nulo = quita o saldo + encargos do dia; data nula = não pagou
-- moeda/forma seguem o perfil da unidade
-- ============================================================
create temp table demo_pagamentos_especificos (
  identificacao text not null,
  origem text not null check (origem in ('cuota', 'fondo', 'extra')),
  mes int not null,
  data_pagamento timestamptz,
  valor_usd numeric(12,2),
  observacao text
) on commit drop;

insert into demo_pagamentos_especificos (identificacao, origem, mes, data_pagamento, valor_usd, observacao) values
  -- Carlos Eduardo: ascensor da torre 22 (US$ 150, vence 30/04) em 3 abonos, todos dentro da carência
  ('22-08', 'extra', 4, '2026-04-17 18:20:00-04', 50.00, 'Abono 1 de 3'),
  ('22-08', 'extra', 4, '2026-04-27 18:05:00-04', 50.00, 'Abono 2 de 3'),
  ('22-08', 'extra', 4, '2026-05-04 17:45:00-04', null,  'Abono 3 de 3');

-- ============================================================
-- PLANO DE PAGAMENTOS (derivado dos perfis + específicos)
-- ============================================================
create temp table demo_cobrancas on commit drop as
select
  c.id as cobranca_id,
  u.identificacao,
  right(u.identificacao, 2)::int as n,
  case
    when c.tipo = 'extraordinaria' then 'extra'
    when c.taxa_condominio_id = 'd3000000-0000-0000-0000-000000000001' then 'cuota'
    else 'fondo'
  end as origem,
  extract(month from c.data_vencimento)::int as mes,
  c.tipo,
  c.data_emissao,
  c.data_vencimento
from cobrancas c
join unidades u on u.id = c.unidade_id
where c.id::text like 'd5000000-%' or c.id::text like 'd6000000-%';

create temp table demo_plano (
  cobranca_id uuid not null,
  data_pagamento timestamptz not null,
  valor_usd numeric(12,2),
  observacao text
) on commit drop;

-- regra dos perfis (dia do pagamento; horário 9h–17h de Caracas, espalhado por unidade)
insert into demo_plano (cobranca_id, data_pagamento)
select
  dc.cobranca_id,
  (d.dia + make_interval(hours => 9 + dc.n % 9, mins => (dc.n * 7) % 60)) at time zone 'America/Caracas'
from demo_cobrancas dc
join demo_perfis p on p.identificacao = dc.identificacao
cross join lateral (
  select case
    when dc.tipo = 'ordinaria' then dc.data_emissao + dc.n % 5
    else dc.data_emissao + 2 + dc.n % 6
  end as dia_pontual
) b
cross join lateral (
  select case p.perfil
    when 'lote' then (select min(x) from unnest(p.datas_lote) x where x >= dc.data_emissao)
    when 'atrasador' then
      case when dc.mes = any(p.meses_atraso) then dc.data_vencimento + p.dias_atraso else b.dia_pontual end
    when 'cronico' then
      case when dc.data_vencimento < p.corte then b.dia_pontual end
    when 'ignora_extra' then
      case when dc.tipo = 'ordinaria' then b.dia_pontual end
    else b.dia_pontual
  end as dia
) d
where d.dia is not null;

-- específicos substituem a regra do perfil
delete from demo_plano pl
 using demo_cobrancas dc, demo_pagamentos_especificos e
 where dc.cobranca_id = pl.cobranca_id
   and e.identificacao = dc.identificacao and e.origem = dc.origem and e.mes = dc.mes;

insert into demo_plano (cobranca_id, data_pagamento, valor_usd, observacao)
select dc.cobranca_id, e.data_pagamento, e.valor_usd, e.observacao
  from demo_pagamentos_especificos e
  join demo_cobrancas dc on dc.identificacao = e.identificacao and dc.origem = e.origem and dc.mes = e.mes
 where e.data_pagamento is not null;

-- simulação termina em 30/09
delete from demo_plano where data_pagamento >= '2026-10-01 00:00:00-04';

-- ============================================================
-- EXECUÇÃO (ordem cronológica, via liquidar_cobranca)
-- ============================================================
do $$
declare
  r record;
  v_cob cobrancas%rowtype;
  v_principal_pago numeric;
  v_saldo numeric;
  v_dia date;
  v_encargos numeric;
  v_total_usd numeric;
  v_valor_recebido numeric;
  v_tasa numeric;
  v_referencia text;
  v_pagamento_id uuid;
begin
  for r in
    select pl.*, p.moeda, p.forma
      from demo_plano pl
      join demo_cobrancas dc on dc.cobranca_id = pl.cobranca_id
      join demo_perfis p on p.identificacao = dc.identificacao
     order by pl.data_pagamento, dc.data_vencimento, dc.origem, pl.cobranca_id
  loop
    select * into v_cob from cobrancas where id = r.cobranca_id;

    -- saldo e encargos do dia, pela mesma regra que liquidar_cobranca aplica
    select coalesce(sum(valor_principal_abatido_usd), 0) into v_principal_pago
      from pagamento_cobrancas where cobranca_id = r.cobranca_id;
    v_saldo := greatest(v_cob.valor_usd - v_cob.valor_credito_abatido_usd - v_principal_pago, 0);
    v_dia := (r.data_pagamento at time zone 'America/Caracas')::date;
    v_encargos := calcular_encargos_cobranca(r.cobranca_id, v_dia);

    -- valor exato devido (ou o abono informado): nunca sobra crédito
    v_total_usd := coalesce(r.valor_usd, v_saldo + v_encargos);

    if r.moeda = 'VES' then
      v_tasa := null;
      select tasa_ves into v_tasa
        from cotacao_bcv where data_cotacao <= v_dia
       order by data_cotacao desc limit 1;
      if v_tasa is null then
        raise exception 'Sem cotação BCV em ou antes de % (rode o 04 antes)', v_dia;
      end if;
      v_valor_recebido := round(v_total_usd * v_tasa, 2);
    else
      v_valor_recebido := v_total_usd;
    end if;

    v_referencia := case r.forma
      when 'pago_movil' then lpad((abs(hashtext(r.cobranca_id::text || r.data_pagamento::text)) % 100000000)::text, 8, '0')
      when 'transferencia' then '0102' || lpad((abs(hashtext(r.data_pagamento::text || r.cobranca_id::text)) % 100000000)::text, 8, '0')
      when 'zelle' then upper(substr(md5(r.cobranca_id::text || r.data_pagamento::text), 1, 10))
      else null
    end;

    v_pagamento_id := liquidar_cobranca(
      r.cobranca_id, r.moeda, v_valor_recebido, r.data_pagamento, r.forma,
      v_referencia,
      coalesce(r.observacao, case when r.forma = 'efectivo_usd' then 'Recibido en la administración' end)
    );

    update pagamentos set created_at = r.data_pagamento where id = v_pagamento_id;
  end loop;

  if exists (select 1 from creditos_movimentacoes) then
    raise exception 'O seed gerou saldo a favor, e a demo não deveria ter crédito';
  end if;
end;
$$;

-- Conferência: situação por perfil
select p.perfil, count(*) filter (where c.status = 'pago') as pagas,
       count(*) filter (where c.status = 'pendente') as pendentes
  from cobrancas c
  join unidades u on u.id = c.unidade_id
  join demo_perfis p on p.identificacao = u.identificacao
 where c.id::text like 'd5000000-%' or c.id::text like 'd6000000-%'
 group by p.perfil
 order by p.perfil;

commit;
