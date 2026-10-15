import type { RegrasEncargos } from "@/lib/encargos";
import type { AcordoDaCobranca } from "@/lib/types/acordos";
import type { PagamentoDaCobranca } from "@/lib/types/pagamentos";

export type CobrancaTipo = "ordinaria" | "extraordinaria";
export type CobrancaStatus = "pendente" | "pago" | "cancelado";

export type CobrancaDaUnidade = RegrasEncargos & {
  id: string;
  tipo: CobrancaTipo;
  descricao: string;
  // título da taxa ou do rateio de origem (a descrição das ordinárias é sempre "Taxa de condomínio")
  titulo_origem: string;
  competencia: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  valor_principal_pago_usd: number;
  valor_juros_pago_usd: number;
  data_ultimo_pagamento: string | null;
  pagamentos: PagamentoDaCobranca[];
  data_vencimento: string;
  status: CobrancaStatus;
  // acordo de pagamento que congela os juros desta cobrança, se ela entrou em um
  acordo: AcordoDaCobranca | null;
};
