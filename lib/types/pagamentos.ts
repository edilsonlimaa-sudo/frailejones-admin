import type { MoedaTipo } from "@/lib/types/creditos";
import type { CobrancaTipo } from "@/lib/types/cobrancas";

export type FormaPagamentoTipo = "pago_movil" | "transferencia" | "efectivo_usd" | "zelle";

export type Liquidacao = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  valor_equivalente_usd: number;
  forma_pagamento: FormaPagamentoTipo;
  referencia_bancaria: string | null;
  observacao: string | null;
  unidade: { id: string; identificacao: string } | null;
  cobranca: { id: string; descricao: string; tipo: CobrancaTipo } | null;
};

// um pagamento visto a partir da cobrança que ele liquidou (parcial ou total)
export type PagamentoDaCobranca = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  valor_equivalente_usd: number;
  tasa_bcv_aplicada: number | null;
  forma_pagamento: FormaPagamentoTipo;
  referencia_bancaria: string | null;
  observacao: string | null;
  valor_principal_abatido_usd: number;
  valor_juros_pago_usd: number;
  // sobra do pagamento que virou crédito da unidade (creditos_movimentacoes ENTRADA vinculada a este pagamento)
  creditoGeradoUsd: number;
};
