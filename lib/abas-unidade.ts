// abas da tela de uma unidade (admin e portal), guardadas na URL como ?aba=
export const ABAS_UNIDADE = ["geral", "cobrancas", "creditos"] as const;
export type AbaUnidade = (typeof ABAS_UNIDADE)[number];
export const ABA_UNIDADE_PADRAO: AbaUnidade = "geral";

// valor vem da URL (editável pelo usuário): qualquer coisa fora da lista cai na aba padrão
export function resolverAbaUnidade(valor: string | string[] | undefined): AbaUnidade {
  return ABAS_UNIDADE.find((aba) => aba === valor) ?? ABA_UNIDADE_PADRAO;
}
