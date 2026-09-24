export type MovimentacaoTipo = "ENTRADA" | "SAIDA";
export type MoedaTipo = "USD" | "VES";

export type CreditoMovimentacao = {
  id: string;
  tipo: MovimentacaoTipo;
  moeda: MoedaTipo;
  valor: number;
  valor_equivalente_usd: number;
  descricao: string | null;
  created_at: string;
};
