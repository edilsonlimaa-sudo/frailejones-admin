export type CobrancaTipo = "ordinaria" | "extraordinaria";
export type CobrancaStatus = "pendente" | "pago" | "cancelado";

export type CobrancaDaUnidade = {
  id: string;
  tipo: CobrancaTipo;
  descricao: string;
  competencia: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  status: CobrancaStatus;
};

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

export type UnidadeCobrancaDoMes = {
  unidade_id: string;
  unidade_identificacao: string;
  cobranca: {
    id: string;
    valor_usd: number;
    valor_credito_abatido_usd: number;
    data_vencimento: string;
    status: CobrancaStatus;
    valor_principal_pago_usd: number;
    valor_juros_pago_usd: number;
  } | null;
};
