-- Multa e juros passam a ser calculados no banco, na data do pagamento.
--
-- Antes, liquidar_cobranca recebia p_encargos_usd pronto do navegador: qualquer usuário logado
-- podia mandar outro valor, e o modal mandava os encargos de HOJE mesmo quando o pagamento era
-- registrado com data anterior (quem pagou no prazo e foi registrado depois levava multa, e o
-- pagamento ia primeiro pros encargos, deixando a cota em aberto). A cotação em VES também era a
-- mais recente, não a vigente no dia do pagamento.
--
-- Regra de encargos (espelhada em lib/encargos.ts, que só faz a prévia nas telas), com prazo =
-- vencimento + carência e o dia de cada pagamento em Caracas:
--   - multa uma vez só, sobre o principal ainda em aberto no prazo;
--   - juros simples ao dia, só sobre o principal em aberto em cada trecho entre pagamentos;
--   - devido = multa + juros acumulados até a data - encargos já quitados por pagamentos anteriores.
-- Antes, cada pagamento parcial recalculava a multa sobre o saldo restante e os juros desde o
-- prazo, cobrando de novo o que já tinha sido pago.

-- ============================================================
-- CALCULAR_ENCARGOS_COBRANCA
-- Multa + juros ainda devidos numa cobrança na data informada (dia em Caracas), considerando os
-- pagamentos já registrados até essa data.
-- ============================================================
create or replace function calcular_encargos_cobranca(p_cobranca_id uuid, p_data date)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_cobranca cobrancas%rowtype;
  v_prazo date;
  v_saldo numeric;
  v_multa numeric;
  v_juros numeric := 0;
  v_desde date;
  v_encargos_pagos numeric;
  v_pagamento record;
begin
  select * into v_cobranca from cobrancas where id = p_cobranca_id;
  if not found then
    raise exception 'Cobrança % não encontrada', p_cobranca_id;
  end if;

  v_prazo := v_cobranca.data_vencimento + v_cobranca.dias_graca;
  if p_data <= v_prazo then
    return 0;
  end if;

  select
    coalesce(sum(pc.valor_principal_abatido_usd)
      filter (where (p.data_pagamento at time zone 'America/Caracas')::date <= v_prazo), 0),
    coalesce(sum(pc.valor_juros_pago_usd), 0)
    into v_saldo, v_encargos_pagos
    from pagamento_cobrancas pc
    join pagamentos p on p.id = pc.pagamento_id
   where pc.cobranca_id = p_cobranca_id
     and (p.data_pagamento at time zone 'America/Caracas')::date <= p_data;

  v_saldo := v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd - v_saldo;
  v_multa := round(greatest(v_saldo, 0) * v_cobranca.pct_multa_atraso / 100, 2);

  v_desde := v_prazo;
  for v_pagamento in
    select (p.data_pagamento at time zone 'America/Caracas')::date as dia,
           pc.valor_principal_abatido_usd as principal
      from pagamento_cobrancas pc
      join pagamentos p on p.id = pc.pagamento_id
     where pc.cobranca_id = p_cobranca_id
       and (p.data_pagamento at time zone 'America/Caracas')::date > v_prazo
       and (p.data_pagamento at time zone 'America/Caracas')::date <= p_data
     order by p.data_pagamento
  loop
    v_juros := v_juros
      + greatest(v_saldo, 0) * v_cobranca.pct_juros_diario * (v_pagamento.dia - v_desde) / 100;
    v_saldo := v_saldo - v_pagamento.principal;
    v_desde := v_pagamento.dia;
  end loop;
  v_juros := round(
    v_juros + greatest(v_saldo, 0) * v_cobranca.pct_juros_diario * (p_data - v_desde) / 100,
    2
  );

  return greatest(v_multa + v_juros - v_encargos_pagos, 0);
end;
$$;

-- ============================================================
-- LIQUIDAR_COBRANCA
-- Mesma alocação de antes (encargos primeiro, depois principal, sobra vira saldo a favor), mas
-- encargos e cotação agora vêm do banco, pela data do pagamento. Sem p_encargos_usd e sem
-- p_cotacao_bcv_id, então a assinatura muda e a versão antiga é removida.
-- ============================================================
drop function if exists liquidar_cobranca(
  uuid, moeda_tipo, numeric, uuid, numeric, timestamptz, forma_pagamento_tipo, text, text
);

create or replace function liquidar_cobranca(
  p_cobranca_id uuid,
  p_moeda moeda_tipo,
  p_valor_recebido numeric,
  p_data_pagamento timestamptz,
  p_forma_pagamento forma_pagamento_tipo,
  p_referencia_bancaria text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_cobranca cobrancas%rowtype;
  v_dia date := (p_data_pagamento at time zone 'America/Caracas')::date;
  v_ultimo_dia date;
  v_valor_recebido numeric := round(p_valor_recebido, 2);
  v_cotacao_id uuid;
  v_tasa numeric;
  v_valor_equivalente_usd numeric;
  v_encargos numeric;
  v_principal_pago numeric;
  v_saldo_devedor numeric;
  v_juros numeric;
  v_principal numeric;
  v_sobra_usd numeric;
  v_sobra_na_moeda numeric;
  v_pagamento_id uuid;
  c_sobra_minima_usd constant numeric := 1.00;
begin
  select * into v_cobranca from cobrancas where id = p_cobranca_id for update;
  if not found then
    raise exception 'Cobrança % não encontrada', p_cobranca_id;
  end if;
  if v_cobranca.status <> 'pendente' then
    raise exception 'Cobrança não está pendente (status atual: %)', v_cobranca.status;
  end if;
  if v_valor_recebido is null or v_valor_recebido <= 0 then
    raise exception 'Valor recebido deve ser maior que zero';
  end if;
  if p_data_pagamento is null or v_dia > (now() at time zone 'America/Caracas')::date then
    raise exception 'A data do pagamento não pode ser futura';
  end if;

  -- os encargos de um pagamento dependem dos anteriores; um pagamento com data anterior a outro
  -- já registrado mudaria o que aquele outro deveria ter pago, então a ordem é obrigatória
  select max((p.data_pagamento at time zone 'America/Caracas')::date)
    into v_ultimo_dia
    from pagamento_cobrancas pc
    join pagamentos p on p.id = pc.pagamento_id
   where pc.cobranca_id = p_cobranca_id;
  if v_ultimo_dia > v_dia then
    raise exception 'Esta cobrança já tem um pagamento em % (data posterior à informada)',
      to_char(v_ultimo_dia, 'DD/MM/YYYY');
  end if;

  if p_moeda = 'VES' then
    -- cotação vigente no dia do pagamento: a de fecha valor mais recente até esse dia
    select id, tasa_ves into v_cotacao_id, v_tasa
      from cotacao_bcv
     where data_cotacao <= v_dia
     order by data_cotacao desc
     limit 1;
    if v_tasa is null then
      raise exception 'Não há cotação BCV vigente em % para pagamento em VES', to_char(v_dia, 'DD/MM/YYYY');
    end if;
    v_valor_equivalente_usd := round(v_valor_recebido / v_tasa, 2);
  else
    v_valor_equivalente_usd := v_valor_recebido;
  end if;
  if v_valor_equivalente_usd <= 0 then
    raise exception 'Valor recebido deve ser maior que zero';
  end if;

  v_encargos := calcular_encargos_cobranca(p_cobranca_id, v_dia);

  select coalesce(sum(valor_principal_abatido_usd), 0)
    into v_principal_pago
    from pagamento_cobrancas
   where cobranca_id = p_cobranca_id;

  v_saldo_devedor := greatest(
    v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd - v_principal_pago,
    0
  );
  v_juros := least(v_valor_equivalente_usd, v_encargos);
  v_principal := least(v_valor_equivalente_usd - v_juros, v_saldo_devedor);
  v_sobra_usd := v_valor_equivalente_usd - v_juros - v_principal;

  insert into pagamentos (
    unidade_id, moeda, valor_recebido, cotacao_bcv_id, tasa_bcv_aplicada, valor_equivalente_usd,
    data_pagamento, forma_pagamento, referencia_bancaria, observacao
  )
  values (
    v_cobranca.unidade_id,
    p_moeda,
    v_valor_recebido,
    v_cotacao_id,
    v_tasa,
    v_valor_equivalente_usd,
    p_data_pagamento,
    p_forma_pagamento,
    nullif(btrim(p_referencia_bancaria), ''),
    nullif(btrim(p_observacao), '')
  )
  returning id into v_pagamento_id;

  insert into pagamento_cobrancas (pagamento_id, cobranca_id, valor_principal_abatido_usd, valor_juros_pago_usd)
  values (v_pagamento_id, p_cobranca_id, v_principal, v_juros);

  if v_sobra_usd >= c_sobra_minima_usd then
    -- sobra registrada na MESMA moeda do pagamento. Em VES, calcula direto sobre os Bs. recebidos
    -- menos o alocado convertido — reconverter v_sobra_usd (já arredondado) creditaria Bs. a mais
    v_sobra_na_moeda := case
      when p_moeda = 'VES' then v_valor_recebido - round((v_juros + v_principal) * v_tasa, 2)
      else v_sobra_usd
    end;

    if v_sobra_na_moeda > 0 then
      insert into creditos_movimentacoes (unidade_id, tipo, moeda, valor, pagamento_id, descricao)
      values (
        v_cobranca.unidade_id, 'ENTRADA', p_moeda, v_sobra_na_moeda, v_pagamento_id,
        format('Sobra do pagamento da cobrança "%s"', v_cobranca.descricao)
      );
    end if;
  end if;

  if v_principal >= v_saldo_devedor then
    update cobrancas set status = 'pago' where id = p_cobranca_id;
  end if;

  return v_pagamento_id;
end;
$$;

revoke execute on function calcular_encargos_cobranca(uuid, date) from public, anon;
revoke execute on function liquidar_cobranca(uuid, moeda_tipo, numeric, timestamptz, forma_pagamento_tipo, text, text) from public, anon;

grant execute on function calcular_encargos_cobranca(uuid, date) to authenticated, service_role;
grant execute on function liquidar_cobranca(uuid, moeda_tipo, numeric, timestamptz, forma_pagamento_tipo, text, text) to authenticated, service_role;
