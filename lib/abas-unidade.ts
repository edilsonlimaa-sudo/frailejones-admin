// abas da tela de uma unidade (admin e portal), guardadas na URL como ?aba=. A lista de cobranças
// é a principal; o estado de conta tem aba própria; "geral" são os dados de registro
export const ABAS_UNIDADE = ["cobrancas", "estado", "geral", "creditos", "acordos"] as const;
export type AbaUnidade = (typeof ABAS_UNIDADE)[number];
export const ABA_UNIDADE_PADRAO: AbaUnidade = "cobrancas";

// valor vem da URL (editável pelo usuário): qualquer coisa fora da lista cai na aba padrão
export function resolverAbaUnidade(valor: string | string[] | undefined): AbaUnidade {
  return ABAS_UNIDADE.find((aba) => aba === valor) ?? ABA_UNIDADE_PADRAO;
}
