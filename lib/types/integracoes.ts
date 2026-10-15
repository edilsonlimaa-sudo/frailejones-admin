// linha da tabela integracao: o que o administrador configurou para uma integração do catálogo
export type IntegracaoConfigurada = {
  chave: string;
  ativa: boolean;
  config: Record<string, string>;
  atualizado_em: string;
};
