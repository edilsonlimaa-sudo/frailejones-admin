import type { AcordoParaEncargos } from "@/lib/encargos";

// acordo de pagamento de uma unidade (migration acordos_pagamento)
export type AcordoPagamento = {
  id: string;
  unidade_id: string;
  data_inicio: string;
  observacao: string | null;
  // quanto o morador se comprometeu a pagar por mês (informativo); null quando não combinado
  valor_parcela_usd: number | null;
  // null enquanto o acordo não foi quebrado
  quebrado_em: string | null;
  created_at: string;
};

// o acordo visto a partir de uma cobrança que faz parte dele (embed acordo:acordos_pagamento)
export type AcordoDaCobranca = AcordoParaEncargos & { id: string };
