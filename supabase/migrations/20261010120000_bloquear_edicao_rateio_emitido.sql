-- Rateio extraordinário não é editável depois de cadastrado.
--
-- O cadastro já emite uma cobrança por unidade participante, e cada cobrança copia valor,
-- vencimento, multa, juros, carência e título da despesa. Editar a despesa depois (como a versão
-- anterior permitia com p_id) mudava o rateio sem mudar as cobranças já emitidas — e algumas
-- podem até já estar pagas. Como não existe rateio "salvo e ainda não emitido", qualquer edição
-- é de um rateio com cobranças: a função passa a recusar p_id e só cadastra.
--
-- A assinatura fica igual (o app chama com p_id nulo), então as permissões de EXECUTE da
-- migration funcoes_transacionais_creditos continuam valendo.

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
  if p_id is not null then
    raise exception 'Rateio extraordinário com cobranças emitidas não pode ser editado';
  end if;
  if coalesce(cardinality(p_unidade_ids), 0) = 0 then
    raise exception 'Selecione ao menos uma unidade';
  end if;

  insert into despesas_extraordinarias (
    titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento,
    pct_multa_atraso, pct_juros_diario, dias_graca
  )
  values (
    p_titulo, p_descricao, p_valor_total_usd, p_valor_por_unidade_usd, p_data_vencimento,
    p_pct_multa_atraso, p_pct_juros_diario, p_dias_graca
  )
  returning * into v_despesa;

  insert into despesa_extraordinaria_unidades (despesa_extraordinaria_id, unidade_id)
  select v_despesa.id, u.unidade_id
    from (select distinct unnest(p_unidade_ids) as unidade_id) u;

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

  return v_despesa;
end;
$$;
