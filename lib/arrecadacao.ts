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

export type CobrancaParaPontualidade = {
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[];
};

// base = emitido das cobranças cujo prazo já acabou; emDia = quanto dele foi quitado dentro do prazo
export type Pontualidade = { base: number; emDia: number };

// pago "em dia" = quitado até o vencimento + dias de carência (depois disso já incidem multa e
// juros). Cobrança cujo prazo ainda não acabou fica fora da base: ninguém está atrasado nela ainda,
// e contá-la derrubaria a pontualidade do mês corrente. Saldo a favor é aplicado na emissão, então
// conta como em dia.
export function acumularPontualidade(
  acc: Pontualidade,
  cobranca: CobrancaParaPontualidade,
  hojeIso: string,
): void {
  const limite = new Date(`${cobranca.data_vencimento}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + cobranca.dias_graca);
  const prazo = limite.toISOString().slice(0, 10);
  if (hojeIso <= prazo) return;

  acc.base += cobranca.valor_usd;
  acc.emDia += cobranca.valor_credito_abatido_usd;
  for (const p of cobranca.pagamento_cobrancas) {
    if (p.pagamento && dataCaixaCaracas(p.pagamento.data_pagamento) <= prazo) {
      acc.emDia += p.valor_principal_abatido_usd;
    }
  }
}

// null quando nenhuma cobrança do período teve o prazo encerrado ainda
export function percentualEmDia(pontualidade: Pontualidade): number | null {
  return pontualidade.base > 0 ? Math.min(100, (pontualidade.emDia / pontualidade.base) * 100) : null;
}

export type PagamentoDoPeriodo = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  forma_pagamento: FormaPagamentoTipo;
  // pagamento_cobrancas.pagamento_id é UNIQUE: o embed reverso vem como objeto único (ou null)
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    cobranca: { competencia: string } | null;
  } | null;
};

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

function resumirMoeda(pagamentos: PagamentoDoPeriodo[]): EntradasNaMoeda {
  const canais = new Map<FormaPagamentoTipo, CanalDeEntrada>();
  let total = 0;
  for (const p of pagamentos) {
    total += p.valor_recebido;
    const canal = canais.get(p.forma_pagamento) ?? { forma: p.forma_pagamento, quantidade: 0, valor: 0 };
    canal.quantidade += 1;
    canal.valor += p.valor_recebido;
    canais.set(p.forma_pagamento, canal);
  }
  return {
    quantidade: pagamentos.length,
    total,
    canais: [...canais.values()].sort((a, b) => b.valor - a.valor),
  };
}

// principal abatido por um pagamento (base do "quitado" no gráfico de evolução)
export function principalQuitado(p: PagamentoDoPeriodo): number {
  return p.pagamento_cobrancas?.valor_principal_abatido_usd ?? 0;
}

// resume os pagamentos recebidos num mês de caixa. `competenciaDoMes` é o primeiro dia do mês
// ("YYYY-MM-01"), usado pra separar o que quitou cobrança do próprio mês do que recuperou atraso.
export function resumirEntradas(
  pagamentos: PagamentoDoPeriodo[],
  competenciaDoMes: string,
): ResumoEntradas {
  const quitacao: QuitacaoDoMes = {
    principalDoMes: 0,
    principalAtrasado: 0,
    principalAdiantado: 0,
    encargos: 0,
    total: 0,
  };

  for (const p of pagamentos) {
    const principal = principalQuitado(p);
    const competencia = p.pagamento_cobrancas?.cobranca?.competencia;
    if (competencia && competencia < competenciaDoMes) {
      quitacao.principalAtrasado += principal;
    } else if (competencia && competencia > competenciaDoMes) {
      quitacao.principalAdiantado += principal;
    } else {
      quitacao.principalDoMes += principal;
    }
    quitacao.encargos += p.pagamento_cobrancas?.valor_juros_pago_usd ?? 0;
  }
  quitacao.total =
    quitacao.principalDoMes + quitacao.principalAtrasado + quitacao.principalAdiantado + quitacao.encargos;

  return {
    usd: resumirMoeda(pagamentos.filter((p) => p.moeda === "USD")),
    ves: resumirMoeda(pagamentos.filter((p) => p.moeda === "VES")),
    quitacao,
  };
}
