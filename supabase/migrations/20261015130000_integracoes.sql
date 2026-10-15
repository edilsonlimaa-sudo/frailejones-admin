-- Configuração das integrações exibidas em /integracoes.
--
-- O catálogo (quais integrações existem e quais campos cada uma pede) fica no código, em
-- lib/integracoes.ts; aqui só se guarda o que o administrador preencheu. Uma linha por integração
-- configurada, identificada pela chave do catálogo. Por enquanto todas são de demonstração: nada lê
-- essa configuração para falar com serviços externos.

create table integracao (
  chave text primary key,
  ativa boolean not null default true,
  -- valores dos campos do catálogo, por nome do campo
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
