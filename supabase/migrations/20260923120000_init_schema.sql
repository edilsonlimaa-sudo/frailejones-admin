-- Schema inicial: proprietários, unidades, cobranças (ordinárias/extraordinárias),
-- pagamentos (USD/VES via cotação BCV) e livro-razão de créditos das unidades.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
create type cobranca_tipo as enum ('ordinaria', 'extraordinaria');
create type cobranca_status as enum ('pendente', 'pago', 'cancelado');
create type moeda_tipo as enum ('USD', 'VES');
create type forma_pagamento_tipo as enum ('pago_movil', 'transferencia', 'efectivo_usd', 'zelle');
create type movimentacao_tipo as enum ('ENTRADA', 'SAIDA');

-- ============================================================
-- PROPRIETARIOS
-- ============================================================
create table proprietarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento_identidad text not null,
  telefone_whatsapp text,
  email text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- UNIDADES
-- ============================================================
create table unidades (
  id uuid primary key default gen_random_uuid(),
  identificacao text not null unique,
  proprietario_id uuid not null references proprietarios(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index idx_unidades_proprietario_id on unidades(proprietario_id);

-- ============================================================
-- TAXA_CONDOMINIO
-- ============================================================
create table taxa_condominio (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  valor_usd numeric(12,2) not null,
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  pct_multa_atraso numeric(5,2) not null default 0,
  pct_juros_diario numeric(7,4) not null default 0,
  dias_graca integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TAXA_CONDOMINIO_UNIDADES (unidades vinculadas a uma taxa recorrente;
-- uma unidade pode estar em N taxas simultaneamente, ex: ordinária + fundo de reserva)
-- ============================================================
create table taxa_condominio_unidades (
  id uuid primary key default gen_random_uuid(),
  taxa_condominio_id uuid not null references taxa_condominio(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (taxa_condominio_id, unidade_id)
);

create index idx_tcu_taxa_condominio_id on taxa_condominio_unidades(taxa_condominio_id);
create index idx_tcu_unidade_id on taxa_condominio_unidades(unidade_id);

-- ============================================================
-- FATURAMENTOS_COMPETENCIA (registra que a emissão mensal de uma competência já
-- foi processada, com o total de unidades faturadas naquele momento. Sem isso, uma
-- unidade vinculada depois da emissão apareceria como "pendente" num mês que já
-- fechou — a competência processada precisa ficar congelada, não recalculada a
-- partir do vínculo atual)
-- ============================================================
create table faturamentos_competencia (
  id uuid primary key default gen_random_uuid(),
  taxa_condominio_id uuid not null references taxa_condominio(id) on delete cascade,
  competencia date not null,
  quantidade_unidades_faturadas integer not null,
  data_processamento timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (taxa_condominio_id, competencia)
);

create index idx_fc_taxa_competencia on faturamentos_competencia(taxa_condominio_id, competencia);

-- ============================================================
-- DESPESAS_EXTRAORDINARIAS
-- ============================================================
create table despesas_extraordinarias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  valor_total_usd numeric(12,2) not null,
  valor_por_unidade_usd numeric(12,2) not null,
  data_vencimento date not null,
  pct_multa_atraso numeric(5,2) not null default 0,
  pct_juros_diario numeric(7,4) not null default 0,
  dias_graca integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DESPESA_EXTRAORDINARIA_UNIDADES (unidades participantes de uma despesa)
-- ============================================================
create table despesa_extraordinaria_unidades (
  id uuid primary key default gen_random_uuid(),
  despesa_extraordinaria_id uuid not null references despesas_extraordinarias(id) on delete cascade,
  unidade_id uuid not null references unidades(id) on delete cascade,
  unique (despesa_extraordinaria_id, unidade_id)
);

create index idx_deu_despesa_id on despesa_extraordinaria_unidades(despesa_extraordinaria_id);
create index idx_deu_unidade_id on despesa_extraordinaria_unidades(unidade_id);

-- ============================================================
-- COBRANCAS
-- ============================================================
create table cobrancas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete restrict,
  tipo cobranca_tipo not null,
  descricao text not null,
  competencia date not null,
  valor_usd numeric(12,2) not null,
  valor_credito_abatido_usd numeric(12,2) not null default 0,
  data_emissao date not null default current_date,
  data_vencimento date not null,
  -- snapshot: regras congeladas na emissão, mesmo que a taxa/despesa de origem mude depois
  pct_multa_atraso numeric(5,2) not null,
  pct_juros_diario numeric(7,4) not null,
  dias_graca integer not null,
  status cobranca_status not null default 'pendente',
  taxa_condominio_id uuid references taxa_condominio(id) on delete set null,
  despesa_extraordinaria_id uuid references despesas_extraordinarias(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_cobranca_origem check (
    (tipo = 'ordinaria' and taxa_condominio_id is not null and despesa_extraordinaria_id is null)
    or
    (tipo = 'extraordinaria' and despesa_extraordinaria_id is not null and taxa_condominio_id is null)
  )
);

-- evita 2 cobranças da mesma taxa para a mesma unidade na mesma competência
-- (uma unidade pode ter várias taxas simultâneas, então taxa_condominio_id entra na chave)
create unique index uq_cobranca_ordinaria_por_competencia
  on cobrancas (unidade_id, competencia, taxa_condominio_id)
  where tipo = 'ordinaria';

create index idx_cobrancas_unidade_id on cobrancas(unidade_id);
create index idx_cobrancas_taxa_condominio_id on cobrancas(taxa_condominio_id);
create index idx_cobrancas_despesa_extraordinaria_id on cobrancas(despesa_extraordinaria_id);

-- ============================================================
-- COTACAO_BCV
-- ============================================================
create table cotacao_bcv (
  id uuid primary key default gen_random_uuid(),
  data_cotacao date not null unique,
  tasa_ves numeric(16,6) not null,
  fuente text not null default 'oficial',
  created_at timestamptz not null default now()
);

-- ============================================================
-- PAGAMENTOS
-- ============================================================
create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete restrict,
  moeda moeda_tipo not null,
  valor_recebido numeric(16,2) not null,
  cotacao_bcv_id uuid references cotacao_bcv(id) on delete set null,
  -- taxa congelada no momento do pagamento; não muda se cotacao_bcv for corrigida depois
  tasa_bcv_aplicada numeric(16,6),
  valor_equivalente_usd numeric(12,2) not null,
  data_pagamento timestamptz not null,
  forma_pagamento forma_pagamento_tipo not null,
  referencia_bancaria text,
  comprovante_url text,
  observacao text,
  created_at timestamptz not null default now(),
  constraint chk_pagamento_cambio check (
    (moeda = 'USD' and cotacao_bcv_id is null and tasa_bcv_aplicada is null)
    or
    (moeda = 'VES' and cotacao_bcv_id is not null and tasa_bcv_aplicada is not null)
  )
);

create index idx_pagamentos_unidade_id on pagamentos(unidade_id);
create index idx_pagamentos_cotacao_bcv_id on pagamentos(cotacao_bcv_id);

-- ============================================================
-- PAGAMENTO_COBRANCAS (um pagamento liquida no máximo uma cobrança; uma
-- cobrança pode receber vários pagamentos parciais ao longo do tempo)
-- ============================================================
create table pagamento_cobrancas (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references pagamentos(id) on delete cascade,
  cobranca_id uuid not null references cobrancas(id) on delete cascade,
  valor_principal_abatido_usd numeric(12,2) not null,
  valor_juros_pago_usd numeric(12,2) not null default 0,
  valor_total_alocado_usd numeric(12,2)
    generated always as (valor_principal_abatido_usd + valor_juros_pago_usd) stored,
  unique (pagamento_id)
);

create index idx_pc_cobranca_id on pagamento_cobrancas(cobranca_id);

-- ============================================================
-- CREDITOS_MOVIMENTACOES (livro-razão de crédito por unidade)
-- ENTRADA: sobra de pagamento ou crédito manual (pagamento_id opcional, sem cobranca_id)
-- SAIDA: consumo de crédito para abater uma cobrança (cobranca_id obrigatório, sem pagamento_id)
-- ============================================================
create table creditos_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references unidades(id) on delete restrict,
  tipo movimentacao_tipo not null,
  moeda moeda_tipo not null,
  valor numeric(16,2) not null,
  pagamento_id uuid references pagamentos(id) on delete set null,
  cobranca_id uuid references cobrancas(id) on delete set null,
  cotacao_bcv_id uuid references cotacao_bcv(id) on delete set null,
  tasa_bcv_aplicada numeric(16,6),
  valor_equivalente_usd numeric(12,2) not null,
  descricao text,
  created_at timestamptz not null default now(),
  constraint chk_credito_origem_destino check (
    (tipo = 'ENTRADA' and cobranca_id is null)
    or
    (tipo = 'SAIDA' and cobranca_id is not null and pagamento_id is null)
  ),
  constraint chk_credito_cambio check (
    (moeda = 'USD' and cotacao_bcv_id is null and tasa_bcv_aplicada is null)
    or
    (moeda = 'VES' and cotacao_bcv_id is not null and tasa_bcv_aplicada is not null)
  )
);

create index idx_creditos_unidade_id on creditos_movimentacoes(unidade_id);
create index idx_creditos_pagamento_id on creditos_movimentacoes(pagamento_id);
create index idx_creditos_cobranca_id on creditos_movimentacoes(cobranca_id);
