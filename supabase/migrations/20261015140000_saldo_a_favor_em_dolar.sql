-- Saldo a favor numa carteira só, em dólar.
--
-- Antes havia duas carteiras: a sobra de um pagamento em bolívares ficava em Bs. e só era
-- convertida quando aplicada numa cobrança, pela cotação desse dia. Como as cobranças já são em
-- dólar e o pagamento em Bs. já é convertido pela BCV do dia em que foi feito, o morador pagava
-- em dólar e recebia o troco em bolívar: quem pagava adiantado (ex.: o ano todo) via o próprio
-- crédito desvalorizar até ser usado. Agora a sobra entra direto em dólar, pela mesma conversão
-- do pagamento (valor_equivalente_usd), e o risco cambial dos Bs. recebidos fica com o condomínio.
--
-- O mínimo de $ 1,00 pra sobra virar saldo a favor também sai: ele existia porque centavos em Bs.
-- desvalorizavam e só poluíam a carteira. Em dólar, qualquer sobra a partir de $ 0,01 é crédito.

-- ============================================================
-- HISTÓRICO: movimentações em VES viram USD
-- ENTRADA pela taxa congelada do pagamento que a gerou; SAÍDA (e ENTRADA sem pagamento) pela
-- cotação vigente no dia do lançamento, que é a que aplicar_saldo_a_favor usava. A descrição
-- guarda o valor original em Bs.
-- ============================================================
update creditos_movimentacoes m
   set valor = round(m.valor / coalesce(
         (select p.tasa_bcv_aplicada from pagamentos p where p.id = m.pagamento_id),
         (select c.tasa_ves from cotacao_bcv c
           where c.data_cotacao <= (m.created_at at time zone 'America/Caracas')::date
           order by c.data_cotacao desc limit 1)
       ), 2),
       moeda = 'USD',
       descricao = concat_ws(' ', m.descricao, format('(convertido de Bs. %s)', m.valor))
 where m.moeda = 'VES';

alter table creditos_movimentacoes
  add constraint creditos_movimentacoes_em_dolar check (moeda = 'USD');

-- ============================================================
-- APLICAR_SALDO_A_FAVOR
-- Aplica o saldo a favor (USD) da unidade no saldo devedor de uma cobrança pendente. Mesma
-- assinatura; sem a carteira VES não há mais conversão pela cotação do dia. Devolve o valor
-- aplicado em USD (0 se não havia saldo).
-- ============================================================
create or replace function aplicar_saldo_a_favor(p_cobranca_id uuid)
returns numeric
language plpgsql
set search_path = public
as $$
declare
  v_cobranca cobrancas%rowtype;
  v_principal_pago numeric;
  v_saldo_devedor numeric;
  v_saldo_usd numeric;
  v_aplicado numeric;
begin
  select * into v_cobranca from cobrancas where id = p_cobranca_id for update;
  if not found then
    raise exception 'Cobrança % não encontrada', p_cobranca_id;
  end if;
  if v_cobranca.status <> 'pendente' then
    return 0;
  end if;

  -- serializa o consumo de crédito por unidade: duas transações não podem ler o mesmo saldo
  -- e gastá-lo duas vezes. NO KEY UPDATE não bloqueia inserts que só referenciam a unidade (FK)
  perform 1 from unidades where id = v_cobranca.unidade_id for no key update;

  select coalesce(sum(valor_principal_abatido_usd), 0)
    into v_principal_pago
    from pagamento_cobrancas
   where cobranca_id = p_cobranca_id;

  v_saldo_devedor := greatest(
    v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd - v_principal_pago,
    0
  );
  if v_saldo_devedor <= 0 then
    return 0;
  end if;

  select coalesce(sum(case when tipo = 'ENTRADA' then valor else -valor end), 0)
    into v_saldo_usd
    from creditos_movimentacoes
   where unidade_id = v_cobranca.unidade_id;

  v_aplicado := least(greatest(v_saldo_usd, 0), v_saldo_devedor);
  if v_aplicado <= 0 then
    return 0;
  end if;

  insert into creditos_movimentacoes (unidade_id, tipo, moeda, valor, cobranca_id, descricao)
  values (
    v_cobranca.unidade_id, 'SAIDA', 'USD', v_aplicado, p_cobranca_id,
    format('Aplicado na cobrança "%s"', v_cobranca.descricao)
  );

  update cobrancas
     set valor_credito_abatido_usd = valor_credito_abatido_usd + v_aplicado,
         status = case when v_aplicado >= v_saldo_devedor then 'pago'::cobranca_status else status end
   where id = p_cobranca_id;

  return v_aplicado;
end;
$$;

-- ============================================================
-- LIQUIDAR_COBRANCA
-- Igual à da migration encargos_calculados_no_banco (encargos e cotação do banco, pela data do
-- pagamento), mas a sobra entra como saldo a favor em USD e sem o mínimo de $ 1,00. Mesma
-- assinatura, então as permissões de EXECUTE continuam valendo.
-- ============================================================
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
  v_pagamento_id uuid;
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

  -- sobra vira saldo a favor em dólar, pela mesma conversão do pagamento (sem mínimo)
  if v_sobra_usd > 0 then
    insert into creditos_movimentacoes (unidade_id, tipo, moeda, valor, pagamento_id, descricao)
    values (
      v_cobranca.unidade_id, 'ENTRADA', 'USD', v_sobra_usd, v_pagamento_id,
      format('Sobra do pagamento da cobrança "%s"', v_cobranca.descricao)
    );
  end if;

  if v_principal >= v_saldo_devedor then
    update cobrancas set status = 'pago' where id = p_cobranca_id;
  end if;

  return v_pagamento_id;
end;
$$;
