-- Seletor de mês do Dashboard como índice: cada mês da grade mostra quanto do emitido já foi
-- saldado. Para isso a evolução passa a trazer, por mês de competência, a quantidade de cobranças
-- e o principal saldado (saldo a favor aplicado + abatido por pagamentos, de qualquer data). O
-- 'quitado' existente é por mês de caixa (gráfico de evolução) e segue igual.

create or replace function resumo_dashboard(p_mes date, p_meses integer, p_hoje date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with janela as (
    select
      date_trunc('month', p_mes)::date as mes,
      (date_trunc('month', p_mes) - make_interval(months => p_meses - 1))::date as inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date as fim
  ),
  meses as (
    select generate_series(j.inicio, j.fim - interval '1 month', interval '1 month')::date as mes
      from janela j
  ),
  -- pagamentos da janela, cada um com o que abateu (pagamento_cobrancas.pagamento_id é UNIQUE)
  pagamentos_janela as (
    select
      p.moeda,
      p.forma_pagamento,
      p.valor_recebido,
      date_trunc('month', p.data_pagamento at time zone 'America/Caracas')::date as mes_caixa,
      coalesce(pc.valor_principal_abatido_usd, 0) as principal,
      coalesce(pc.valor_juros_pago_usd, 0) as encargos,
      date_trunc('month', c.competencia)::date as mes_cobranca
    from pagamentos p
    cross join janela j
    left join pagamento_cobrancas pc on pc.pagamento_id = p.id
    left join cobrancas c on c.id = pc.cobranca_id
    where p.data_pagamento >= (j.inicio::timestamp at time zone 'America/Caracas')
      and p.data_pagamento < (j.fim::timestamp at time zone 'America/Caracas')
  ),
  pagamentos_do_mes as (
    select pj.* from pagamentos_janela pj join janela j on pj.mes_caixa = j.mes
  ),
  cobrancas_janela as (
    select
      c.id,
      date_trunc('month', c.competencia)::date as mes,
      c.valor_usd,
      c.valor_credito_abatido_usd,
      c.data_vencimento + c.dias_graca as prazo
    from cobrancas c
    cross join janela j
    where c.status <> 'cancelado'
      and c.competencia >= j.inicio
      and c.competencia < j.fim
  ),
  pontualidade as (
    select
      cj.mes,
      sum(cj.valor_usd) as base,
      sum(cj.valor_credito_abatido_usd + coalesce(em_dia.principal, 0)) as em_dia
    from cobrancas_janela cj
    left join lateral (
      select sum(pc.valor_principal_abatido_usd) as principal
        from pagamento_cobrancas pc
        join pagamentos p on p.id = pc.pagamento_id
       where pc.cobranca_id = cj.id
         and (p.data_pagamento at time zone 'America/Caracas')::date <= cj.prazo
    ) em_dia on true
    where p_hoje > cj.prazo
    group by cj.mes
  )
  select jsonb_build_object(
    -- caixa do mês selecionado, por moeda e forma de pagamento (sem converter moedas)
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'moeda', e.moeda, 'forma', e.forma_pagamento, 'quantidade', e.quantidade, 'valor', e.valor
      ) order by e.valor desc)
      from (
        select moeda, forma_pagamento, count(*) as quantidade, sum(valor_recebido) as valor
          from pagamentos_do_mes
         group by moeda, forma_pagamento
      ) e
    ), '[]'::jsonb),
    -- dívida abonada pelos pagamentos do mês, pelo mês de competência da cobrança
    'quitacao', (
      select jsonb_build_object(
        'principalDoMes', coalesce(sum(pm.principal) filter (where pm.mes_cobranca is null or pm.mes_cobranca = j.mes), 0),
        'principalAtrasado', coalesce(sum(pm.principal) filter (where pm.mes_cobranca < j.mes), 0),
        'principalAdiantado', coalesce(sum(pm.principal) filter (where pm.mes_cobranca > j.mes), 0),
        'encargos', coalesce(sum(pm.encargos), 0)
      )
      from janela j
      left join pagamentos_do_mes pm on true
      group by j.mes
    ),
    -- um ponto por mês da janela do gráfico
    'evolucao', (
      select jsonb_agg(jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'emitido', coalesce((select sum(cj.valor_usd) from cobrancas_janela cj where cj.mes = m.mes), 0),
        'quitado', coalesce((select sum(pj.principal) from pagamentos_janela pj where pj.mes_caixa = m.mes), 0),
        -- cobranças do mês e quanto do principal delas já foi saldado (crédito + pagamentos, de qualquer data)
        'cobrancas', coalesce((select count(*) from cobrancas_janela cj where cj.mes = m.mes), 0),
        'saldado', coalesce((
          select sum(cj.valor_credito_abatido_usd + coalesce(ab.principal, 0))
            from cobrancas_janela cj
            left join lateral (
              select sum(pc.valor_principal_abatido_usd) as principal
                from pagamento_cobrancas pc
               where pc.cobranca_id = cj.id
            ) ab on true
           where cj.mes = m.mes
        ), 0),
        'baseEmDia', coalesce(pt.base, 0),
        'emDia', coalesce(pt.em_dia, 0)
      ) order by m.mes)
      from meses m
      left join pontualidade pt on pt.mes = m.mes
    )
  );
$$;

-- só usuários autenticados (admin); o Supabase concede EXECUTE a anon por padrão em funções novas
revoke execute on function resumo_dashboard(date, integer, date) from public, anon;
grant execute on function resumo_dashboard(date, integer, date) to authenticated, service_role;
