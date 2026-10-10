import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";

// Caracas é UTC-4 o ano todo (sem horário de verão). data_pagamento é timestamptz, então o
// recorte do mês de caixa precisa ser feito no fuso local: um pagamento às 22h do dia 31 em
// Caracas já é dia 1 em UTC e cairia no mês seguinte.
const OFFSET_CARACAS = "-04:00";

export function inicioDoMesCaracas(ano: number, mes: number): string {
  const data = new Date(Date.UTC(ano, mes - 1, 1));
  const iso = data.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00${OFFSET_CARACAS}`).toISOString();
}

// "YYYY-MM-DD" do dia (no fuso de Caracas) em que o pagamento caiu
export function dataCaixaCaracas(dataPagamento: string): string {
  const local = new Date(new Date(dataPagamento).getTime() - 4 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// "YYYY-MM" do mês (no fuso de Caracas) em que o pagamento caiu
export function mesCaixaCaracas(dataPagamento: string): string {
  return dataCaixaCaracas(dataPagamento).slice(0, 7);
}

// % pago em dia: base = emitido das cobranças cujo prazo (vencimento + carência) já acabou; emDia =
// quanto dele foi quitado dentro do prazo. A regra é aplicada no banco (resumo_dashboard).
// null quando nenhuma cobrança do período teve o prazo encerrado ainda
export function percentualEmDia(base: number, emDia: number): number | null {
  return base > 0 ? Math.min(100, (emDia / base) * 100) : null;
}

export type CanalDeEntrada = {
  forma: FormaPagamentoTipo;
  quantidade: number;
  valor: number;
};

// caixa de uma moeda, sempre na moeda em que o dinheiro entrou
export type EntradasNaMoeda = {
  quantidade: number;
  total: number;
  canais: CanalDeEntrada[];
};

// quanto os pagamentos abateram das cobranças, em dólares. Pagamento em bolívar entra pelo
// valor que abateu da dívida, convertido na tasa BCV congelada no dia da liquidação.
// A sobra (que vira saldo a favor na moeda do pagamento) não é dívida quitada e fica de fora.
export type QuitacaoDoMes = {
  principalDoMes: number;
  principalAtrasado: number;
  principalAdiantado: number;
  encargos: number;
  total: number;
};

export type ResumoEntradas = {
  // caixa: dólar e bolívar nunca são somados nem convertidos
  usd: EntradasNaMoeda;
  ves: EntradasNaMoeda;
  quitacao: QuitacaoDoMes;
};

// retorno da função resumo_dashboard (migration resumo_dashboard): os totais são somados no banco
// porque a API corta consultas em 1000 linhas, e a janela de 6 meses do gráfico passa disso
export type ResumoDashboard = {
  // caixa do mês selecionado, uma linha por moeda + forma de pagamento, já ordenada por valor
  entradas: { moeda: MoedaTipo; forma: FormaPagamentoTipo; quantidade: number; valor: number }[];
  quitacao: Omit<QuitacaoDoMes, "total">;
  // um ponto por mês da janela do gráfico ("YYYY-MM"), em ordem
  evolucao: { mes: string; emitido: number; quitado: number; baseEmDia: number; emDia: number }[];
};

function entradasDaMoeda(entradas: ResumoDashboard["entradas"], moeda: MoedaTipo): EntradasNaMoeda {
  const canais = entradas
    .filter((e) => e.moeda === moeda)
    .map((e) => ({ forma: e.forma, quantidade: e.quantidade, valor: e.valor }));
  return {
    quantidade: canais.reduce((acc, c) => acc + c.quantidade, 0),
    total: canais.reduce((acc, c) => acc + c.valor, 0),
    canais,
  };
}

export function montarResumoEntradas(resumo: ResumoDashboard): ResumoEntradas {
  const q = resumo.quitacao;
  return {
    usd: entradasDaMoeda(resumo.entradas, "USD"),
    ves: entradasDaMoeda(resumo.entradas, "VES"),
    quitacao: {
      ...q,
      total: q.principalDoMes + q.principalAtrasado + q.principalAdiantado + q.encargos,
    },
  };
}
