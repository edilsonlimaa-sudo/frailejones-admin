import type { CobrancaStatus } from "@/lib/types/cobrancas";

export type CobrancaParaEncargos = {
  status: CobrancaStatus;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  valor_principal_pago_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
};

export type Encargos = {
  diasAtraso: number;
  saldoDevedor: number;
  valorMulta: number;
  valorJuros: number;
  valorTotalComEncargos: number;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// dias de atraso em relação ao vencimento (já descontada a carência) numa data de referência
// qualquer — não depende do status atual da cobrança. Usado tanto pelo cálculo de encargos "hoje"
// quanto pra reconstruir, depois de paga, há quantos dias a cobrança estava vencida quando um
// pagamento específico foi feito (a informação que gerou a multa/juros daquele pagamento).
export function calcularDiasAtrasoNaData(
  dataVencimento: string,
  diasGraca: number,
  dataReferenciaIso: string,
): number {
  const limiteCarencia = new Date(`${dataVencimento}T00:00:00Z`);
  limiteCarencia.setUTCDate(limiteCarencia.getUTCDate() + diasGraca);

  return Math.max(
    Math.round(
      (new Date(`${dataReferenciaIso}T00:00:00Z`).getTime() - limiteCarencia.getTime()) / MS_POR_DIA,
    ),
    0,
  );
}

// fonte única do cálculo de encargos: multa fixa única + juros simples ao dia sobre o saldo
// devedor, contados a partir do fim da carência (evita divergência entre as telas que listam cobranças)
export function calcularEncargos(cobranca: CobrancaParaEncargos, hojeIso: string): Encargos {
  const saldoDevedor = Math.max(
    cobranca.valor_usd - cobranca.valor_credito_abatido_usd - cobranca.valor_principal_pago_usd,
    0,
  );

  const semEncargos: Encargos = {
    diasAtraso: 0,
    saldoDevedor,
    valorMulta: 0,
    valorJuros: 0,
    valorTotalComEncargos: saldoDevedor,
  };

  if (cobranca.status !== "pendente" || saldoDevedor <= 0) {
    return semEncargos;
  }

  const diasAtraso = calcularDiasAtrasoNaData(cobranca.data_vencimento, cobranca.dias_graca, hojeIso);

  if (diasAtraso <= 0) {
    return semEncargos;
  }

  const valorMulta = Number(((saldoDevedor * cobranca.pct_multa_atraso) / 100).toFixed(2));
  const valorJuros = Number(((saldoDevedor * cobranca.pct_juros_diario * diasAtraso) / 100).toFixed(2));

  return {
    diasAtraso,
    saldoDevedor,
    valorMulta,
    valorJuros,
    valorTotalComEncargos: Number((saldoDevedor + valorMulta + valorJuros).toFixed(2)),
  };
}
