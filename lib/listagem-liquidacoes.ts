// filtros e agrupamentos da tela de Liquidações. Os filtros vivem na URL (?moneda=, ?forma=,
// ?abono=) para o Painel poder abrir a lista já recortada no canal ou no tipo de dívida que o
// usuário clicou no cartão de entradas do mês.
import { dataCaixaCaracas } from "@/lib/arrecadacao";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo, Liquidacao } from "@/lib/types/pagamentos";

export const FORMAS_PAGAMENTO: FormaPagamentoTipo[] = ["pago_movil", "transferencia", "efectivo_usd", "zelle"];

// mesmas chaves do cartão de entradas do Painel (dashboard.focus.cash.settledRows)
export type FiltroAbono = "doMes" | "atrasado" | "adiantado" | "encargos";
export const FILTROS_ABONO: FiltroAbono[] = ["doMes", "atrasado", "adiantado", "encargos"];

export type FiltrosLiquidacoes = {
  moeda: MoedaTipo | null;
  forma: FormaPagamentoTipo | null;
  abono: FiltroAbono | null;
};

const primeiro = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);

export function resolverFiltrosLiquidacoes(params: {
  moneda?: string | string[];
  forma?: string | string[];
  abono?: string | string[];
}): FiltrosLiquidacoes {
  const moeda = primeiro(params.moneda);
  const forma = primeiro(params.forma);
  const abono = primeiro(params.abono);
  return {
    moeda: moeda === "USD" || moeda === "VES" ? moeda : null,
    forma: FORMAS_PAGAMENTO.includes(forma as FormaPagamentoTipo) ? (forma as FormaPagamentoTipo) : null,
    abono: FILTROS_ABONO.includes(abono as FiltroAbono) ? (abono as FiltroAbono) : null,
  };
}

// de que mês era a dívida que o pagamento abateu, em relação ao mês de caixa listado. Mesma regra
// de resumo_dashboard: compara só o mês da competência (a de rateio é o vencimento, não o dia 1)
export function abonoDaLiquidacao(liquidacao: Liquidacao, mesCaixa: string): Exclude<FiltroAbono, "encargos"> | null {
  return liquidacao.cobranca ? abonoDaCompetencia(liquidacao.cobranca.competencia, mesCaixa) : null;
}

export function abonoDaCompetencia(competencia: string, mesCaixa: string): Exclude<FiltroAbono, "encargos"> {
  const mesCobranca = competencia.slice(0, 7);
  if (mesCobranca < mesCaixa) return "atrasado";
  if (mesCobranca > mesCaixa) return "adiantado";
  return "doMes";
}

export function passaNosFiltros(liquidacao: Liquidacao, filtros: FiltrosLiquidacoes, mesCaixa: string): boolean {
  if (filtros.moeda && liquidacao.moeda !== filtros.moeda) return false;
  if (filtros.forma && liquidacao.forma_pagamento !== filtros.forma) return false;
  if (filtros.abono === "encargos") return liquidacao.encargos_pagos_usd > 0;
  if (filtros.abono && abonoDaLiquidacao(liquidacao, mesCaixa) !== filtros.abono) return false;
  return true;
}

export type TotaisPorMoeda = Record<MoedaTipo, number>;

export function totaisPorMoeda(liquidacoes: Liquidacao[]): TotaisPorMoeda {
  const totais: TotaisPorMoeda = { USD: 0, VES: 0 };
  for (const l of liquidacoes) totais[l.moeda] += l.valor_recebido;
  return totais;
}

export type DiaDeCaixa = { dia: string; liquidacoes: Liquidacao[]; totais: TotaisPorMoeda };

// agrupa por dia de caixa em Caracas (a lista já vem do mais recente pro mais antigo), com o
// subtotal de cada moeda: é o que se compara, dia a dia, com o extrato do banco
export function agruparPorDia(liquidacoes: Liquidacao[]): DiaDeCaixa[] {
  const dias: DiaDeCaixa[] = [];
  for (const l of liquidacoes) {
    const dia = dataCaixaCaracas(l.data_pagamento);
    let grupo = dias.at(-1);
    if (grupo?.dia !== dia) {
      grupo = { dia, liquidacoes: [], totais: { USD: 0, VES: 0 } };
      dias.push(grupo);
    }
    grupo.liquidacoes.push(l);
    grupo.totais[l.moeda] += l.valor_recebido;
  }
  return dias;
}
