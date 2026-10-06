-- Funções transacionais para os fluxos que gravam em várias tabelas de uma vez (consumo de
-- saldo a favor, liquidação, emissão mensal e rateio extraordinário). Antes, cada passo era
-- uma requisição separada do navegador: uma falha no meio deixava o banco inconsistente
-- (ex: cobrança abatida sem a SAÍDA correspondente na carteira). Cada função roda numa única
-- transação — ou grava tudo, ou nada.
--
-- SECURITY INVOKER (padrão): as funções rodam com as permissões de quem chama, respeitando RLS.
-- Valores monetários são numeric (exatos), então quitação compara o saldo devedor sem tolerância:
-- crédito de $9,99 numa cobrança de $10,00 deixa $0,01 pendente em vez de dar como paga.

-- ============================================================
-- APLICAR_SALDO_A_FAVOR
-- Aplica o saldo das carteiras da unidade no saldo devedor de uma cobrança pendente.
-- Estratégia: consome primeiro a carteira USD e complementa com VES convertido pela cotação
-- mais recente (saldo VES não consumido não tem tasa congelada). Cada SAÍDA é gravada na moeda
-- da própria carteira. Devolve o valor aplicado em USD (0 se não havia saldo).
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
  v_saldo_ves numeric;
  v_tasa numeric;
  v_saldo_ves_em_usd numeric;
  v_aplicado numeric;
  v_saida_usd numeric;
  v_saida_ves numeric;
  v_restante_usd numeric;
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

  select
    coalesce(sum(case when tipo = 'ENTRADA' then valor else -valor end) filter (where moeda = 'USD'), 0),
    coalesce(sum(case when tipo = 'ENTRADA' then valor else -valor end) filter (where moeda = 'VES'), 0)
    into v_saldo_usd, v_saldo_ves
    from creditos_movimentacoes
   where unidade_id = v_cobranca.unidade_id;

  select tasa_ves into v_tasa from cotacao_bcv order by data_cotacao desc limit 1;

  v_saldo_ves_em_usd := case
    when v_tasa is not null and v_saldo_ves > 0 then v_saldo_ves / v_tasa
    else 0
  end;

  v_aplicado := round(least(greatest(v_saldo_usd, 0) + v_saldo_ves_em_usd, v_saldo_devedor), 2);
  if v_aplicado <= 0 then
    return 0;
  end if;

  v_saida_usd := least(greatest(v_saldo_usd, 0), v_aplicado);
  if v_saida_usd > 0 then
    insert into creditos_movimentacoes (unidade_id, tipo, moeda, valor, cobranca_id, descricao)
    values (
      v_cobranca.unidade_id, 'SAIDA', 'USD', v_saida_usd, p_cobranca_id,
      format('Aplicado na cobrança "%s"', v_cobranca.descricao)
    );
  end if;

  v_restante_usd := v_aplicado - v_saida_usd;
  if v_restante_usd > 0 and v_tasa is not null and v_saldo_ves > 0 then
    -- reconverte o restante em VES pela cotação atual, sem passar do saldo da carteira
    v_saida_ves := least(v_saldo_ves, round(v_restante_usd * v_tasa, 2));
    if v_saida_ves > 0 then
      insert into creditos_movimentacoes (unidade_id, tipo, moeda, valor, cobranca_id, descricao)
      values (
        v_cobranca.unidade_id, 'SAIDA', 'VES', v_saida_ves, p_cobranca_id,
        format('Aplicado na cobrança "%s"', v_cobranca.descricao)
      );
    end if;
  end if;

  update cobrancas
     set valor_credito_abatido_usd = valor_credito_abatido_usd + v_aplicado,
         status = case when v_aplicado >= v_saldo_devedor then 'pago'::cobranca_status else status end
   where id = p_cobranca_id;

  return v_aplicado;
end;
$$;

-- ============================================================
-- LIQUIDAR_COBRANCA
-- Registra um pagamento contra uma cobrança pendente: pagamento, alocação (encargos primeiro,
-- depois principal), sobra como ENTRADA na carteira da moeda recebida e status. Multa/juros do
-- dia vêm calculados pelo app (lib/encargos.ts) em p_encargos_usd; o resto é calculado aqui.
-- Devolve o id do pagamento criado.
--
-- Sobra abaixo de $ 1,00 (equivalente em dólar) não vira saldo a favor: fica absorvida no
-- pagamento (valor_recebido guarda o total). Saldos pequenos em bolívares se desvalorizam rápido
-- e só geram lançamentos de centavos na carteira. O mínimo é em dólar pra acompanhar a
-- desvalorização; o modal de liquidação usa o mesmo valor (SOBRA_MINIMA_USD em lib/moeda.ts).
-- ============================================================
create or replace function liquidar_cobranca(
  p_cobranca_id uuid,
  p_moeda moeda_tipo,
  p_valor_recebido numeric,
  p_cotacao_bcv_id uuid,
  p_encargos_usd numeric,
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
  v_valor_recebido numeric := round(p_valor_recebido, 2);
  v_tasa numeric;
  v_valor_equivalente_usd numeric;
  v_encargos numeric := greatest(round(coalesce(p_encargos_usd, 0), 2), 0);
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

  if p_moeda = 'VES' then
    select tasa_ves into v_tasa from cotacao_bcv where id = p_cotacao_bcv_id;
    if v_tasa is null then
      raise exception 'Pagamento em VES exige uma cotação BCV válida';
    end if;
    v_valor_equivalente_usd := round(v_valor_recebido / v_tasa, 2);
  else
    v_valor_equivalente_usd := v_valor_recebido;
  end if;
  if v_valor_equivalente_usd <= 0 then
    raise exception 'Valor recebido deve ser maior que zero';
  end if;

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
    case when p_moeda = 'VES' then p_cotacao_bcv_id end,
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

-- ============================================================
-- EMITIR_COBRANCAS_TAXA
-- Emite as cobranças de uma taxa de condomínio para as unidades informadas, aplica o saldo a
-- favor de cada uma e fecha a competência (faturamentos_competencia). Devolve quantas foram emitidas.
-- ============================================================
create or replace function emitir_cobrancas_taxa(
  p_taxa_condominio_id uuid,
  p_competencia date,
  p_data_vencimento date,
  p_valor_usd numeric,
  p_pct_multa_atraso numeric,
  p_pct_juros_diario numeric,
  p_dias_graca integer,
  p_unidade_ids uuid[]
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_cobranca record;
  v_quantidade integer := 0;
begin
  if coalesce(cardinality(p_unidade_ids), 0) = 0 then
    raise exception 'Nenhuma unidade informada para emissão';
  end if;
  if exists (
    select 1 from faturamentos_competencia
     where taxa_condominio_id = p_taxa_condominio_id and competencia = p_competencia
  ) then
    raise exception 'Competência % já foi processada para esta taxa', p_competencia;
  end if;

  -- ordem estável por unidade: transações concorrentes travam as unidades na mesma ordem
  for v_cobranca in
    insert into cobrancas (
      unidade_id, tipo, descricao, competencia, valor_usd, data_vencimento,
      pct_multa_atraso, pct_juros_diario, dias_graca, taxa_condominio_id
    )
    select u.unidade_id, 'ordinaria', 'Taxa de condomínio', p_competencia, p_valor_usd, p_data_vencimento,
           p_pct_multa_atraso, p_pct_juros_diario, p_dias_graca, p_taxa_condominio_id
      from (select distinct unnest(p_unidade_ids) as unidade_id) u
     order by u.unidade_id
    returning id
  loop
    perform aplicar_saldo_a_favor(v_cobranca.id);
    v_quantidade := v_quantidade + 1;
  end loop;

  -- fecha a competência: trava o escopo faturado pra não recalcular por vínculos futuros
  insert into faturamentos_competencia (taxa_condominio_id, competencia, quantidade_unidades_faturadas)
  values (p_taxa_condominio_id, p_competencia, v_quantidade);

  return v_quantidade;
end;
$$;

-- ============================================================
-- SALVAR_RATEIO_EXTRAORDINARIO
-- Cria (p_id nulo) ou atualiza um rateio extraordinário e sincroniza as unidades participantes.
-- Na criação também emite uma cobrança por unidade e aplica o saldo a favor de cada uma.
-- Devolve a despesa salva.
-- ============================================================
create or replace function salvar_rateio_extraordinario(
  p_id uuid,
  p_titulo text,
  p_descricao text,
  p_valor_total_usd numeric,
  p_valor_por_unidade_usd numeric,
  p_data_vencimento date,
  p_pct_multa_atraso numeric,
  p_pct_juros_diario numeric,
  p_dias_graca integer,
  p_unidade_ids uuid[]
)
returns despesas_extraordinarias
language plpgsql
set search_path = public
as $$
declare
  v_despesa despesas_extraordinarias%rowtype;
  v_cobranca record;
begin
  if coalesce(cardinality(p_unidade_ids), 0) = 0 then
    raise exception 'Selecione ao menos uma unidade';
  end if;

  if p_id is null then
    insert into despesas_extraordinarias (
      titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento,
      pct_multa_atraso, pct_juros_diario, dias_graca
    )
    values (
      p_titulo, p_descricao, p_valor_total_usd, p_valor_por_unidade_usd, p_data_vencimento,
      p_pct_multa_atraso, p_pct_juros_diario, p_dias_graca
    )
    returning * into v_despesa;
  else
    update despesas_extraordinarias
       set titulo = p_titulo,
           descricao = p_descricao,
           valor_total_usd = p_valor_total_usd,
           valor_por_unidade_usd = p_valor_por_unidade_usd,
           data_vencimento = p_data_vencimento,
           pct_multa_atraso = p_pct_multa_atraso,
           pct_juros_diario = p_pct_juros_diario,
           dias_graca = p_dias_graca
     where id = p_id
    returning * into v_despesa;
    if not found then
      raise exception 'Rateio extraordinário % não encontrado', p_id;
    end if;
  end if;

  -- sincroniza as unidades participantes: remove o vínculo anterior e recria com a seleção atual
  delete from despesa_extraordinaria_unidades where despesa_extraordinaria_id = v_despesa.id;
  insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
  select v_despesa.id, u.unidade_id
    from (select distinct unnest(p_unidade_ids) as unidade_id) u;

  if p_id is null then
    -- diferente da taxa de condomínio, o rateio extraordinário já emite as cobranças no cadastro
    for v_cobranca in
      insert into cobrancas (
        unidade_id, tipo, descricao, competencia, valor_usd, data_vencimento,
        pct_multa_atraso, pct_juros_diario, dias_graca, despesa_extraordinaria_id
      )
      select u.unidade_id, 'extraordinaria', v_despesa.titulo, v_despesa.data_vencimento,
             v_despesa.valor_por_unidade_usd, v_despesa.data_vencimento,
             v_despesa.pct_multa_atraso, v_despesa.pct_juros_diario, v_despesa.dias_graca, v_despesa.id
        from (select distinct unnest(p_unidade_ids) as unidade_id) u
       order by u.unidade_id
      returning id
    loop
      perform aplicar_saldo_a_favor(v_cobranca.id);
    end loop;
  end if;

  return v_despesa;
end;
$$;

-- ============================================================
-- PERMISSÕES: só usuários autenticados (admin) executam. O Supabase concede EXECUTE a anon por
-- padrão em funções novas do schema public, então revoga explicitamente.
-- ============================================================
revoke execute on function aplicar_saldo_a_favor(uuid) from public, anon;
revoke execute on function liquidar_cobranca(uuid, moeda_tipo, numeric, uuid, numeric, timestamptz, forma_pagamento_tipo, text, text) from public, anon;
revoke execute on function emitir_cobrancas_taxa(uuid, date, date, numeric, numeric, numeric, integer, uuid[]) from public, anon;
revoke execute on function salvar_rateio_extraordinario(uuid, text, text, numeric, numeric, date, numeric, numeric, integer, uuid[]) from public, anon;

grant execute on function aplicar_saldo_a_favor(uuid) to authenticated, service_role;
grant execute on function liquidar_cobranca(uuid, moeda_tipo, numeric, uuid, numeric, timestamptz, forma_pagamento_tipo, text, text) to authenticated, service_role;
grant execute on function emitir_cobrancas_taxa(uuid, date, date, numeric, numeric, numeric, integer, uuid[]) to authenticated, service_role;
grant execute on function salvar_rateio_extraordinario(uuid, text, text, numeric, numeric, date, numeric, numeric, integer, uuid[]) to authenticated, service_role;
