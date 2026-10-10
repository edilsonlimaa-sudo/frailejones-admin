import type { CobrancaParaEncargos } from "@/lib/encargos";
import { resumirPendencias } from "@/lib/estado-de-cuenta";
import { formatUsd } from "@/lib/moeda";

// concluido = nada pendente; porVencer = pendentes ainda no prazo; enCobro = há cobrança vencida
export type SituacaoRateio = "concluido" | "porVencer" | "enCobro";

export type ResumoCobrancaRateio = {
  situacao: SituacaoRateio;
  // soma das cobranças emitidas (pode diferir do total da despesa pelo arredondamento)
  esperado: number;
  // principal já quitado (pago ou com saldo a favor); multa e juros ficam em encargosPagos
  recaudado: number;
  encargosPagos: number;
  // saldo das pendentes + multa e juros de hoje
  porCobrar: number;
  cobrancas: number;
  pagas: number;
  pendentes: number;
  vencidas: number;
};

export type CobrancaParaResumoRateio = CobrancaParaEncargos & { valor_juros_pago_usd: number };

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

// progresso de cobrança de um rateio; pendências pela mesma regra do estado de conta
export function resumirCobrancaDoRateio(
  cobrancas: CobrancaParaResumoRateio[],
  hojeIso: string,
): ResumoCobrancaRateio {
  const ativas = cobrancas.filter((c) => c.status !== "cancelado");
  const pendencias = resumirPendencias(ativas, hojeIso);
  const pendentes = ativas.filter((c) => c.status === "pendente").length;
  return {
    situacao: pendentes === 0 ? "concluido" : pendencias.vencidas > 0 ? "enCobro" : "porVencer",
    esperado: arredondar(ativas.reduce((acc, c) => acc + c.valor_usd, 0)),
    recaudado: arredondar(ativas.reduce((acc, c) => acc + c.valor_credito_abatido_usd + c.valor_principal_pago_usd, 0)),
    encargosPagos: arredondar(ativas.reduce((acc, c) => acc + c.valor_juros_pago_usd, 0)),
    porCobrar: pendencias.divida.total,
    cobrancas: ativas.length,
    pagas: ativas.length - pendentes,
    pendentes,
    vencidas: pendencias.vencidas,
  };
}

// o valor por unidade é o total dividido e arredondado em 2 casas (formulário do rateio), então o
// que as unidades pagam somado pode diferir do total em alguns centavos (ex.: $ 1.000 / 24 =
// $ 41,67 → $ 1.000,08). Devolve essa diferença (positiva = cobrado a mais), em centavos exatos.
export function diferencaArredondamento(
  valorTotal: number,
  valorPorUnidade: number,
  unidades: number,
): number {
  return Math.round(valorPorUnidade * unidades * 100 - valorTotal * 100) / 100;
}

// "+ $ 0,08" / "− $ 0,01"
export function formatDiferenca(diferenca: number): string {
  return `${diferenca > 0 ? "+" : "−"} ${formatUsd(Math.abs(diferenca))}`;
}
