// modo de visualização do Dashboard, lembrado num cookie (vale pra qualquer mês navegado)
export const VISOES_PAINEL = ["classico", "foco"] as const;
export type VisaoPainel = (typeof VISOES_PAINEL)[number];
export const VISAO_PAINEL_PADRAO: VisaoPainel = "classico";
export const COOKIE_VISAO_PAINEL = "painel_visao";

export function resolverVisaoPainel(valor: string | undefined): VisaoPainel {
  return VISOES_PAINEL.find((v) => v === valor) ?? VISAO_PAINEL_PADRAO;
}
