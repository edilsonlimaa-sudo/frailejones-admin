export type CobrancaStatus = "pendente" | "pago" | "cancelado";

export type CobrancaDoRateio = {
  id: string;
  descricao: string;
  competencia: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_emissao: string;
  data_vencimento: string;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string } | null;
  valor_principal_pago_usd: number;
  valor_juros_pago_usd: number;
};
