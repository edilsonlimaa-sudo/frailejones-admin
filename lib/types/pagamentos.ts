import type { RegrasEncargos } from "@/lib/encargos";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { CobrancaStatus, CobrancaTipo } from "@/lib/types/cobrancas";

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
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  cobranca: { id: string; descricao: string; tipo: CobrancaTipo; competencia: string } | null;
  // o que o pagamento abateu da cobrança, em dólares (0 quando não liquidou cobrança)
  principal_abatido_usd: number;
  encargos_pagos_usd: number;
  // sobra que virou saldo a favor da unidade, na moeda do pagamento
  credito_gerado: number;
};

// a cobrança que este pagamento (parcial ou total) liquidou, vista a partir da tela de detalhe da liquidação
export type CobrancaDaLiquidacao = RegrasEncargos & {
  id: string;
  tipo: CobrancaTipo;
  descricao: string;
  competencia: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_emissao: string;
  data_vencimento: string;
  status: CobrancaStatus;
};

// um pagamento (parcial ou total) da mesma cobrança, visto a partir da tela de detalhe de uma
// liquidação: o histórico da cobrança inclui o próprio pagamento aberto
export type PagamentoIrmao = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  forma_pagamento: FormaPagamentoTipo;
  valor_principal_abatido_usd: number;
  valor_juros_pago_usd: number;
};

export type CreditoGeradoPeloPagamento = {
  id: string;
  valor: number;
  moeda: MoedaTipo;
  descricao: string | null;
  created_at: string;
};

// visão completa de 1 pagamento (uma "liquidação") + as entidades com as quais ele se relaciona
export type LiquidacaoDetalhe = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  valor_equivalente_usd: number;
  tasa_bcv_aplicada: number | null;
  forma_pagamento: FormaPagamentoTipo;
  referencia_bancaria: string | null;
  comprovante_url: string | null;
  observacao: string | null;
  unidade: { id: string; identificacao: string; proprietario: { id: string; nome: string } | null } | null;
  cobranca: CobrancaDaLiquidacao | null;
  valor_principal_abatido_usd: number;
  valor_juros_pago_usd: number;
  creditosGerados: CreditoGeradoPeloPagamento[];
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
  // sobra do pagamento que virou saldo a favor da unidade, na moeda da carteira onde entrou
  // (creditos_movimentacoes ENTRADA vinculadas a este pagamento)
  creditosGerados: { valor: number; moeda: MoedaTipo }[];
};
