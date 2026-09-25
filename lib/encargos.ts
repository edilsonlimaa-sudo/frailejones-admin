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

  const limiteCarencia = new Date(`${cobranca.data_vencimento}T00:00:00Z`);
  limiteCarencia.setUTCDate(limiteCarencia.getUTCDate() + cobranca.dias_graca);

  const diasAtraso = Math.max(
    Math.round((new Date(`${hojeIso}T00:00:00Z`).getTime() - limiteCarencia.getTime()) / MS_POR_DIA),
    0,
  );

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
