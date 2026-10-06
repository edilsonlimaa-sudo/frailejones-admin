-- Gera 288 unidades (8 torres "21".."28" x 36 apartamentos "01".."36", ex: "22-11", "22-12")
-- com 1 proprietário placeholder por unidade. Idempotente: pula unidades cujo `identificacao`
-- já existe (não recria proprietário nem duplica a unidade). Ajuste os generate_series abaixo
-- se a numeração real das torres/apartamentos for diferente.
-- Depois de rodar, edite nome/documento dos proprietários placeholder pela tela de Unidades.

with alvo as (
  select
    torre::text || '-' || lpad(apto::text, 2, '0') as identificacao
  from generate_series(21, 28) as torre
  cross join generate_series(1, 36) as apto
),
faltantes as (
  select a.identificacao
  from alvo a
  left join unidades u on u.identificacao = a.identificacao
  where u.id is null
),
novos_proprietarios as (
  insert into proprietarios (nome, documento_identidad)
  select
    'Proprietário ' || f.identificacao,
    'PLACEHOLDER-' || f.identificacao
  from faltantes f
  returning id, documento_identidad
)
insert into unidades (identificacao, proprietario_id)
select
  f.identificacao,
  np.id
from faltantes f
join novos_proprietarios np
  on np.documento_identidad = 'PLACEHOLDER-' || f.identificacao;

-- Conferência
select count(*) as total_unidades from unidades;
