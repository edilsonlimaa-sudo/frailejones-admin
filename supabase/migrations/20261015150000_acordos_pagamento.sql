-- Acordo de pagamento: congela os juros das cobranças em atraso de uma unidade.
--
-- Caso típico: um inquilino assume uma dívida antiga e combina pagar aos poucos; enquanto
-- cumpre, os juros dessas cobranças param de crescer. Regras (combinadas com a administradora):
--   - o acordo pega todas as cobranças da unidade que estavam em atraso no dia em que começa
--     (prazo = vencimento + carência antes de data_inicio) e ainda não estão em outro acordo;
--   - o que acumulou até data_inicio continua devido (multa e juros);
--   - vigente: depois de data_inicio os juros dessas cobranças não crescem;
--   - cumprido: quando todas as cobranças do acordo são pagas (derivado, sem coluna);
--   - quebrado (quebrado_em): os juros voltam a correr RETROATIVAMENTE desde data_inicio, mas só
--     sobre o principal que continuava em aberto no dia da quebra. O que foi pago durante o
--     acordo foi pago com os juros congelados e não volta a gerar juros.
-- Cobranças emitidas depois (a cuota de cada mês) ficam fora e seguem a regra normal.

create table acordos_pagamento (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete restrict,
  data_inicio date not null,
  observacao text,
  quebrado_em date,
  created_at timestamptz not null default now(),
  constraint chk_acordo_quebra_depois_do_inicio check (quebrado_em is null or quebrado_em >= data_inicio)
);

create index idx_acordos_pagamento_unidade_id on acordos_pagamento(unidade_id);

-- cada cobrança entra em no máximo um acordo
alter table cobrancas
  add column acordo_pagamento_id uuid references acordos_pagamento(id) on delete restrict;

create index idx_cobrancas_acordo_pagamento_id on cobrancas(acordo_pagamento_id);

-- ============================================================
-- JUROS_DIARIO_TRECHO
-- Juros simples ao dia de um trecho (p_de, p_ate] sobre p_base, respeitando o congelamento de um
-- acordo: entre p_inicio e p_fim a base cai pra p_base_congelada (0 com o acordo vigente; o
-- principal em aberto na quebra, se foi quebrado). Sem acordo (p_inicio nulo), é o cálculo comum.
-- Espelhado em jurosDiarioTrecho (lib/encargos.ts).
-- ============================================================
create or replace function juros_diario_trecho(
  p_de date,
  p_ate date,
  p_base numeric,
  p_pct numeric,
  p_inicio date,
  p_fim date,
  p_base_congelada numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_inicio is null then greatest(p_base, 0) * p_pct * greatest(p_ate - p_de, 0) / 100
    else (
        greatest(p_base, 0) * greatest(least(p_ate, p_inicio) - p_de, 0)
      + least(greatest(p_base, 0), p_base_congelada)
          * greatest(least(p_ate, p_fim) - greatest(p_de, p_inicio), 0)
      + greatest(p_base, 0) * greatest(p_ate - greatest(p_de, p_fim), 0)
    ) * p_pct / 100
  end
$$;

-- ============================================================
-- CALCULAR_ENCARGOS_COBRANCA
-- Mesma assinatura e regras da migration juros_mensais, agora com o congelamento do acordo nos
-- dois métodos. Espelhado em lib/encargos.ts.
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
  v_mes integer;
  v_fim_do_mes date;
  v_abatido numeric;
  v_base numeric;
  -- congelamento do acordo (todos nulos sem acordo)
  v_ac_inicio date;
  v_ac_fim date;
  v_ac_quebrado date;
  v_ac_base numeric;
begin
  select * into v_cobranca from cobrancas where id = p_cobranca_id;
  if not found then
    raise exception 'Cobrança % não encontrada', p_cobranca_id;
  end if;

  if v_cobranca.acordo_pagamento_id is not null then
    select a.data_inicio, coalesce(a.quebrado_em, '9999-12-31'::date), a.quebrado_em
      into v_ac_inicio, v_ac_fim, v_ac_quebrado
      from acordos_pagamento a
     where a.id = v_cobranca.acordo_pagamento_id;

    -- vigente: nada gera juros no período; quebrado: só o principal que seguia em aberto na quebra
    v_ac_base := 0;
    if v_ac_quebrado is not null then
      select v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd
             - coalesce(sum(pc.valor_principal_abatido_usd), 0)
        into v_ac_base
        from pagamento_cobrancas pc
        join pagamentos p on p.id = pc.pagamento_id
       where pc.cobranca_id = p_cobranca_id
         and (p.data_pagamento at time zone 'America/Caracas')::date <= v_ac_quebrado;
      v_ac_base := greatest(v_ac_base, 0);
    end if;
  end if;

  if v_cobranca.metodo_encargos = 'mensal' then
    v_mes := 1;
    loop
      v_fim_do_mes := case v_cobranca.criterio_mes
        when 'dias_corridos' then v_cobranca.data_vencimento + 30 * v_mes
        else (v_cobranca.data_vencimento + make_interval(months => v_mes))::date
      end;
      exit when v_fim_do_mes > p_data;

      -- principal em aberto no dia em que o mês fecha (pagamentos desse mesmo dia ainda não abatem)
      select coalesce(sum(pc.valor_principal_abatido_usd), 0)
        into v_abatido
        from pagamento_cobrancas pc
        join pagamentos p on p.id = pc.pagamento_id
       where pc.cobranca_id = p_cobranca_id
         and (p.data_pagamento at time zone 'America/Caracas')::date < v_fim_do_mes;

      v_base := greatest(v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd - v_abatido, 0);
      if v_ac_inicio is not null and v_fim_do_mes > v_ac_inicio and v_fim_do_mes <= v_ac_fim then
        v_base := least(v_base, v_ac_base);
      end if;

      v_juros := v_juros + v_base * v_cobranca.pct_juros_mensal / 100;
      v_mes := v_mes + 1;
    end loop;

    select coalesce(sum(pc.valor_juros_pago_usd), 0)
      into v_encargos_pagos
      from pagamento_cobrancas pc
      join pagamentos p on p.id = pc.pagamento_id
     where pc.cobranca_id = p_cobranca_id
       and (p.data_pagamento at time zone 'America/Caracas')::date <= p_data;

    return greatest(round(v_juros, 2) - v_encargos_pagos, 0);
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
    v_juros := v_juros + juros_diario_trecho(
      v_desde, v_pagamento.dia, v_saldo, v_cobranca.pct_juros_diario, v_ac_inicio, v_ac_fim, v_ac_base
    );
    v_saldo := v_saldo - v_pagamento.principal;
    v_desde := v_pagamento.dia;
  end loop;
  v_juros := round(
    v_juros + juros_diario_trecho(
      v_desde, p_data, v_saldo, v_cobranca.pct_juros_diario, v_ac_inicio, v_ac_fim, v_ac_base
    ),
    2
  );

  return greatest(v_multa + v_juros - v_encargos_pagos, 0);
end;
$$;

-- ============================================================
-- CRIAR_ACORDO_PAGAMENTO
-- Cria o acordo e vincula as cobranças da unidade que estavam em atraso na data de início.
-- A data pode ser passada (acordo combinado antes de ser registrado), nunca futura.
-- ============================================================
create or replace function criar_acordo_pagamento(
  p_unidade_id uuid,
  p_data_inicio date,
  p_observacao text default null
)
returns acordos_pagamento
language plpgsql
set search_path = public
as $$
declare
  v_acordo acordos_pagamento%rowtype;
begin
  if p_data_inicio is null or p_data_inicio > (now() at time zone 'America/Caracas')::date then
    raise exception 'A data de início do acordo não pode ser futura';
  end if;

  -- serializa com a emissão/liquidação da unidade
  perform 1 from unidades where id = p_unidade_id for no key update;
  if not found then
    raise exception 'Unidade % não encontrada', p_unidade_id;
  end if;

  insert into acordos_pagamento (unidade_id, data_inicio, observacao)
  values (p_unidade_id, p_data_inicio, nullif(btrim(p_observacao), ''))
  returning * into v_acordo;

  update cobrancas
     set acordo_pagamento_id = v_acordo.id
   where unidade_id = p_unidade_id
     and status = 'pendente'
     and acordo_pagamento_id is null
     and data_vencimento + dias_graca < p_data_inicio;

  if not found then
    raise exception 'A unidade não tem cobranças em atraso em % para incluir no acordo',
      to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;

  return v_acordo;
end;
$$;

-- ============================================================
-- QUEBRAR_ACORDO_PAGAMENTO
-- Marca o acordo como quebrado na data informada: os juros voltam a correr desde o início do
-- acordo sobre o que seguia em aberto nesse dia (ver juros_diario_trecho e calcular_encargos).
-- ============================================================
create or replace function quebrar_acordo_pagamento(p_acordo_id uuid, p_data date)
returns acordos_pagamento
language plpgsql
set search_path = public
as $$
declare
  v_acordo acordos_pagamento%rowtype;
begin
  select * into v_acordo from acordos_pagamento where id = p_acordo_id for update;
  if not found then
    raise exception 'Acordo % não encontrado', p_acordo_id;
  end if;
  if v_acordo.quebrado_em is not null then
    raise exception 'O acordo já foi quebrado em %', to_char(v_acordo.quebrado_em, 'DD/MM/YYYY');
  end if;
  if p_data is null or p_data < v_acordo.data_inicio
     or p_data > (now() at time zone 'America/Caracas')::date then
    raise exception 'A data da quebra deve estar entre o início do acordo e hoje';
  end if;

  update acordos_pagamento set quebrado_em = p_data where id = p_acordo_id
  returning * into v_acordo;

  return v_acordo;
end;
$$;

revoke execute on function criar_acordo_pagamento(uuid, date, text) from public, anon;
revoke execute on function quebrar_acordo_pagamento(uuid, date) from public, anon;

grant execute on function criar_acordo_pagamento(uuid, date, text) to authenticated, service_role;
grant execute on function quebrar_acordo_pagamento(uuid, date) to authenticated, service_role;
