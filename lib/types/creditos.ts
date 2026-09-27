export type MovimentacaoTipo = "ENTRADA" | "SAIDA";
export type MoedaTipo = "USD" | "VES";

export type CreditoOrigemCobranca = {
  id: string;
  descricao: string;
  competencia: string;
};

export type CreditoMovimentacao = {
  id: string;
  tipo: MovimentacaoTipo;
  moeda: MoedaTipo;
  valor: number;
  descricao: string | null;
  created_at: string;
  // ENTRADA: pagamento que gerou a sobra + a cobrança que esse pagamento liquidou
  pagamento: { id: string; data_pagamento: string; cobranca: CreditoOrigemCobranca | null } | null;
  // SAIDA: cobrança onde o crédito foi aplicado como abatimento de principal
  cobranca: CreditoOrigemCobranca | null;
};
