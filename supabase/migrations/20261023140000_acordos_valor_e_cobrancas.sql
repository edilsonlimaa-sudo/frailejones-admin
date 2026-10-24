-- Acordo de pagamento com valor acordado (quanto o morador se comprometeu a pagar por mês, só
-- informativo: nada é cobrado automaticamente) e escolha das cobranças que entram. A função
-- criar_acordo_pagamento passa a receber o valor e a lista de cobranças; sem lista, entram todas as
-- vencidas elegíveis, como antes.

alter table acordos_pagamento
  add column valor_parcela_usd numeric(12,2),
  add constraint chk_acordo_valor_parcela_positivo
    check (valor_parcela_usd is null or valor_parcela_usd > 0);

drop function if exists criar_acordo_pagamento(uuid, date, text);

create or replace function criar_acordo_pagamento(
  p_unidade_id uuid,
  p_data_inicio date,
  p_observacao text default null,
  p_valor_parcela_usd numeric default null,
  p_cobranca_ids uuid[] default null
)
returns acordos_pagamento
language plpgsql
set search_path = public
as $$
declare
  v_acordo acordos_pagamento%rowtype;
  v_escolhidas integer;
  v_elegiveis integer;
begin
  if p_data_inicio is null or p_data_inicio > (now() at time zone 'America/Caracas')::date then
    raise exception 'A data de início do acordo não pode ser futura';
  end if;
  if p_valor_parcela_usd is not null and p_valor_parcela_usd <= 0 then
    raise exception 'O valor acordado deve ser maior que zero';
  end if;

  -- serializa com a emissão/liquidação da unidade
  perform 1 from unidades where id = p_unidade_id for no key update;
  if not found then
    raise exception 'Unidade % não encontrada', p_unidade_id;
  end if;

  -- escolhidas precisam todas ser elegíveis: da unidade, pendentes, fora de acordo e vencidas na data
  if p_cobranca_ids is not null then
    select count(distinct x) into v_escolhidas from unnest(p_cobranca_ids) as x;
    if v_escolhidas = 0 then
      raise exception 'Escolha ao menos uma cobrança para o acordo';
    end if;
    select count(*) into v_elegiveis
      from cobrancas c
     where c.id = any(p_cobranca_ids)
       and c.unidade_id = p_unidade_id
       and c.status = 'pendente'
       and c.acordo_pagamento_id is null
       and c.data_vencimento + c.dias_graca < p_data_inicio;
    if v_elegiveis <> v_escolhidas then
      raise exception 'Alguma cobrança escolhida não está vencida em % ou já está em outro acordo',
        to_char(p_data_inicio, 'DD/MM/YYYY');
    end if;
  end if;

  insert into acordos_pagamento (unidade_id, data_inicio, observacao, valor_parcela_usd)
  values (p_unidade_id, p_data_inicio, nullif(btrim(p_observacao), ''), p_valor_parcela_usd)
  returning * into v_acordo;

  update cobrancas
     set acordo_pagamento_id = v_acordo.id
   where unidade_id = p_unidade_id
     and status = 'pendente'
     and acordo_pagamento_id is null
     and data_vencimento + dias_graca < p_data_inicio
     and (p_cobranca_ids is null or id = any(p_cobranca_ids));

  if not found then
    raise exception 'A unidade não tem cobranças em atraso em % para incluir no acordo',
      to_char(p_data_inicio, 'DD/MM/YYYY');
  end if;

  return v_acordo;
end;
$$;

revoke execute on function criar_acordo_pagamento(uuid, date, text, numeric, uuid[]) from public, anon;
grant execute on function criar_acordo_pagamento(uuid, date, text, numeric, uuid[]) to authenticated, service_role;
