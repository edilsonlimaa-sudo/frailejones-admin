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

// "YYYY-MM" do mês (no fuso de Caracas) em que o pagamento caiu
export function mesCaixaCaracas(dataPagamento: string): string {
  const local = new Date(new Date(dataPagamento).getTime() - 4 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 7);
}

export type PagamentoDoPeriodo = {
  id: string;
  data_pagamento: string;
  moeda: MoedaTipo;
  valor_recebido: number;
  valor_equivalente_usd: number;
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
  moeda: MoedaTipo;
  quantidade: number;
  valorRecebido: number;
  valorUsd: number;
};

export type ResumoEntradas = {
  quantidade: number;
  totalUsd: number;
  recebidoUsd: number;
  recebidoVes: number;
  recebidoVesEmUsd: number;
  // composição do que entrou (soma = totalUsd)
  principalDoMes: number;
  principalAtrasado: number;
  principalAdiantado: number;
  encargos: number;
  // sobra que virou saldo a favor (>= $1) ou ficou absorvida no pagamento (< $1)
  sobra: number;
  canais: CanalDeEntrada[];
};

// resume os pagamentos recebidos num mês de caixa. `competenciaDoMes` é o primeiro dia do mês
// ("YYYY-MM-01"), usado pra separar o que quitou cobrança do próprio mês do que recuperou atraso.
export function resumirEntradas(
  pagamentos: PagamentoDoPeriodo[],
  competenciaDoMes: string,
): ResumoEntradas {
  const resumo: ResumoEntradas = {
    quantidade: pagamentos.length,
    totalUsd: 0,
    recebidoUsd: 0,
    recebidoVes: 0,
    recebidoVesEmUsd: 0,
    principalDoMes: 0,
    principalAtrasado: 0,
    principalAdiantado: 0,
    encargos: 0,
    sobra: 0,
    canais: [],
  };
  const canais = new Map<string, CanalDeEntrada>();

  for (const p of pagamentos) {
    resumo.totalUsd += p.valor_equivalente_usd;
    if (p.moeda === "USD") {
      resumo.recebidoUsd += p.valor_recebido;
    } else {
      resumo.recebidoVes += p.valor_recebido;
      resumo.recebidoVesEmUsd += p.valor_equivalente_usd;
    }

    const alocacao = p.pagamento_cobrancas;
    const principal = alocacao?.valor_principal_abatido_usd ?? 0;
    const encargos = alocacao?.valor_juros_pago_usd ?? 0;
    const competencia = alocacao?.cobranca?.competencia;
    if (competencia && competencia < competenciaDoMes) {
      resumo.principalAtrasado += principal;
    } else if (competencia && competencia > competenciaDoMes) {
      resumo.principalAdiantado += principal;
    } else {
      resumo.principalDoMes += principal;
    }
    resumo.encargos += encargos;
    resumo.sobra += Math.max(0, p.valor_equivalente_usd - principal - encargos);

    // transferência pode ser em dólar ou em bolívar: cada combinação é uma conta diferente
    const chave = `${p.forma_pagamento}:${p.moeda}`;
    const canal = canais.get(chave) ?? {
      forma: p.forma_pagamento,
      moeda: p.moeda,
      quantidade: 0,
      valorRecebido: 0,
      valorUsd: 0,
    };
    canal.quantidade += 1;
    canal.valorRecebido += p.valor_recebido;
    canal.valorUsd += p.valor_equivalente_usd;
    canais.set(chave, canal);
  }

  resumo.canais = [...canais.values()].sort((a, b) => b.valorUsd - a.valorUsd);
  return resumo;
}
