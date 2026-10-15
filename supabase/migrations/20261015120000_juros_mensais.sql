-- Segundo método de encargos: juros mensais.
--
-- Até aqui só existia um método (agora chamado "diario"): multa única + juros simples ao dia,
-- com carência. Administradoras que trabalham com juros por mês (ex.: 3% ao mês, 40 dias de
-- atraso = 1 mês) não conseguiam reproduzir a regra delas. O método "mensal":
--   - não tem multa nem carência (o primeiro mês já funciona como prazo);
--   - cobra pct_juros_mensal a cada mês COMPLETO de atraso, contado do vencimento;
--   - "mês completo" segue criterio_mes: a cada 30 dias corridos, ou no mesmo dia do mês seguinte
--     (vencimento 31/01 fecha em 28/02, 31/03...: sempre a partir do vencimento, sem acumular);
--   - o juro de cada mês incide sobre o principal em aberto no dia em que o mês fecha (pagamento
--     feito nesse mesmo dia ainda paga aquele mês);
--   - devido = juros acumulados até a data - encargos já quitados por pagamentos anteriores.
--
-- Os campos do diário (pct_multa_atraso, pct_juros_diario, dias_graca) ficam intactos; o mensal
-- ganha colunas próprias. Como as demais regras, o método é congelado na cobrança na emissão.

create type metodo_encargos_tipo as enum ('diario', 'mensal');
create type criterio_mes_tipo as enum ('dias_corridos', 'mesmo_dia');

alter table taxa_condominio
  add column metodo_encargos metodo_encargos_tipo not null default 'diario',
  add column pct_juros_mensal numeric(5,2) not null default 0,
  add column criterio_mes criterio_mes_tipo not null default 'dias_corridos';

alter table despesas_extraordinarias
  add column metodo_encargos metodo_encargos_tipo not null default 'diario',
  add column pct_juros_mensal numeric(5,2) not null default 0,
  add column criterio_mes criterio_mes_tipo not null default 'dias_corridos';

alter table cobrancas
  add column metodo_encargos metodo_encargos_tipo not null default 'diario',
  add column pct_juros_mensal numeric(5,2) not null default 0,
  add column criterio_mes criterio_mes_tipo not null default 'dias_corridos';

-- cada método só usa os próprios campos; os do outro ficam zerados
alter table taxa_condominio add constraint taxa_condominio_campos_do_metodo check (
  case metodo_encargos
    when 'diario' then pct_juros_mensal = 0
    else pct_multa_atraso = 0 and pct_juros_diario = 0 and dias_graca = 0
  end
);
alter table despesas_extraordinarias add constraint despesas_extraordinarias_campos_do_metodo check (
  case metodo_encargos
    when 'diario' then pct_juros_mensal = 0
    else pct_multa_atraso = 0 and pct_juros_diario = 0 and dias_graca = 0
  end
);
alter table cobrancas add constraint cobrancas_campos_do_metodo check (
  case metodo_encargos
    when 'diario' then pct_juros_mensal = 0
    else pct_multa_atraso = 0 and pct_juros_diario = 0 and dias_graca = 0
  end
);

-- ============================================================
-- CALCULAR_ENCARGOS_COBRANCA
-- Mesma assinatura; ganha o ramo do método mensal. O ramo diário é o da migration
-- encargos_calculados_no_banco, sem mudança. Espelhado em lib/encargos.ts.
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
begin
  select * into v_cobranca from cobrancas where id = p_cobranca_id;
  if not found then
    raise exception 'Cobrança % não encontrada', p_cobranca_id;
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

      v_juros := v_juros + greatest(
        v_cobranca.valor_usd - v_cobranca.valor_credito_abatido_usd - v_abatido, 0
      ) * v_cobranca.pct_juros_mensal / 100;
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
-- EMITIR_COBRANCAS_TAXA / SALVAR_RATEIO_EXTRAORDINARIO
-- Passam a receber e congelar o método e os campos do mensal. Os parâmetros novos têm default
-- (método diário), então chamadas com a assinatura antiga continuam resolvendo enquanto o app
-- novo não está no ar. As versões antigas são removidas pra não haver duas sobrecargas.
-- ============================================================
drop function if exists emitir_cobrancas_taxa(uuid, date, date, numeric, numeric, numeric, integer, uuid[]);

create or replace function emitir_cobrancas_taxa(
  p_taxa_condominio_id uuid,
  p_competencia date,
  p_data_vencimento date,
  p_valor_usd numeric,
  p_pct_multa_atraso numeric,
  p_pct_juros_diario numeric,
  p_dias_graca integer,
  p_unidade_ids uuid[],
  p_metodo_encargos metodo_encargos_tipo default 'diario',
  p_pct_juros_mensal numeric default 0,
  p_criterio_mes criterio_mes_tipo default 'dias_corridos'
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
      pct_multa_atraso, pct_juros_diario, dias_graca,
      metodo_encargos, pct_juros_mensal, criterio_mes, taxa_condominio_id
    )
    select u.unidade_id, 'ordinaria', 'Taxa de condomínio', p_competencia, p_valor_usd, p_data_vencimento,
           p_pct_multa_atraso, p_pct_juros_diario, p_dias_graca,
           p_metodo_encargos, p_pct_juros_mensal, p_criterio_mes, p_taxa_condominio_id
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

drop function if exists salvar_rateio_extraordinario(
  uuid, text, text, numeric, numeric, date, numeric, numeric, integer, uuid[]
);

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
  p_unidade_ids uuid[],
  p_metodo_encargos metodo_encargos_tipo default 'diario',
  p_pct_juros_mensal numeric default 0,
  p_criterio_mes criterio_mes_tipo default 'dias_corridos'
)
returns despesas_extraordinarias
language plpgsql
set search_path = public
as $$
declare
  v_despesa despesas_extraordinarias%rowtype;
  v_cobranca record;
begin
  if p_id is not null then
    raise exception 'Rateio extraordinário com cobranças emitidas não pode ser editado';
  end if;
  if coalesce(cardinality(p_unidade_ids), 0) = 0 then
    raise exception 'Selecione ao menos uma unidade';
  end if;

  insert into despesas_extraordinarias (
    titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento,
    pct_multa_atraso, pct_juros_diario, dias_graca,
    metodo_encargos, pct_juros_mensal, criterio_mes
  )
  values (
    p_titulo, p_descricao, p_valor_total_usd, p_valor_por_unidade_usd, p_data_vencimento,
    p_pct_multa_atraso, p_pct_juros_diario, p_dias_graca,
    p_metodo_encargos, p_pct_juros_mensal, p_criterio_mes
  )
  returning * into v_despesa;

  insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
  select v_despesa.id, u.unidade_id
    from (select distinct unnest(p_unidade_ids) as unidade_id) u;

  -- diferente da taxa de condomínio, o rateio extraordinário já emite as cobranças no cadastro
  for v_cobranca in
    insert into cobrancas (
      unidade_id, tipo, descricao, competencia, valor_usd, data_vencimento,
      pct_multa_atraso, pct_juros_diario, dias_graca,
      metodo_encargos, pct_juros_mensal, criterio_mes, despesa_extraordinaria_id
    )
    select u.unidade_id, 'extraordinaria', v_despesa.titulo, v_despesa.data_vencimento,
           v_despesa.valor_por_unidade_usd, v_despesa.data_vencimento,
           v_despesa.pct_multa_atraso, v_despesa.pct_juros_diario, v_despesa.dias_graca,
           v_despesa.metodo_encargos, v_despesa.pct_juros_mensal, v_despesa.criterio_mes, v_despesa.id
      from (select distinct unnest(p_unidade_ids) as unidade_id) u
     order by u.unidade_id
    returning id
  loop
    perform aplicar_saldo_a_favor(v_cobranca.id);
  end loop;

  return v_despesa;
end;
$$;

revoke execute on function emitir_cobrancas_taxa(
  uuid, date, date, numeric, numeric, numeric, integer, uuid[], metodo_encargos_tipo, numeric, criterio_mes_tipo
) from public, anon;
revoke execute on function salvar_rateio_extraordinario(
  uuid, text, text, numeric, numeric, date, numeric, numeric, integer, uuid[], metodo_encargos_tipo, numeric, criterio_mes_tipo
) from public, anon;

grant execute on function emitir_cobrancas_taxa(
  uuid, date, date, numeric, numeric, numeric, integer, uuid[], metodo_encargos_tipo, numeric, criterio_mes_tipo
) to authenticated, service_role;
grant execute on function salvar_rateio_extraordinario(
  uuid, text, text, numeric, numeric, date, numeric, numeric, integer, uuid[], metodo_encargos_tipo, numeric, criterio_mes_tipo
) to authenticated, service_role;
