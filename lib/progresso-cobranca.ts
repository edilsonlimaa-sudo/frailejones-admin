import type { CobrancaParaEncargos } from "@/lib/encargos";
import { resumirPendencias } from "@/lib/estado-de-cuenta";

// Progresso de cobrança de um conjunto de cobranças que deveriam ser pagas juntas: as de um
// rateio, ou as de uma cuota num mês. Pendências pela mesma regra do estado de conta.

// concluido = nada pendente; porVencer = pendentes ainda no prazo; enCobro = há cobrança vencida
export type SituacaoProgresso = "concluido" | "porVencer" | "enCobro";

export type ResumoProgresso = {
  situacao: SituacaoProgresso;
  // soma das cobranças emitidas (num rateio, pode diferir do total da despesa pelo arredondamento)
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

export type CobrancaParaProgresso = CobrancaParaEncargos & { valor_juros_pago_usd: number };

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

export function resumirProgresso(
  cobrancas: CobrancaParaProgresso[],
  hojeIso: string,
): ResumoProgresso {
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
