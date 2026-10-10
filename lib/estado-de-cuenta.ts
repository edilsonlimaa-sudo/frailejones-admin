import { dataCaixaCaracas, percentualEmDia } from "@/lib/arrecadacao";
import { calcularEncargos, type Encargos } from "@/lib/encargos";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";

// Estado de conta de uma unidade, calculado só com as cobranças dela (que as telas da unidade e
// do portal já carregam). Mesmas regras do resto do app:
//   - multa/juros de hoje por lib/encargos (atraso conta do fim da carência);
//   - "em dia" = quitado até vencimento + carência, pela data do pagamento em Caracas; cobrança
//     cujo prazo ainda não acabou fica fora da base (igual ao Dashboard).

// quantos meses (incluindo o atual) entram na linha do tempo e no comportamento de pagamento
export const MESES_ESTADO_CONTA = 12;

export type SituacaoConta = "alDia" | "porVencer" | "enAtraso";
export type EstadoCobrancaConta = "enDia" | "conAtraso" | "vencido" | "porVencer";
export type EstadoMesConta = EstadoCobrancaConta | "sinCobros";
export type FaixaAntiguidade = "porVencer" | "d1a30" | "d31a60" | "d61a90" | "mas90";

export const FAIXAS_ANTIGUIDADE: FaixaAntiguidade[] = ["porVencer", "d1a30", "d31a60", "d61a90", "mas90"];

export type EstadoDeConta = {
  situacao: SituacaoConta;
  // primeiro dia de atraso da cobrança vencida mais antiga (dia seguinte ao fim da carência)
  atrasoDesde: string | null;
  divida: { principal: number; encargos: number; total: number };
  proximoVencimento: { origem: string; data: string; valor: number } | null;
  // todos os pagamentos do dia (em Caracas) do pagamento mais recente: o app registra um pagamento
  // por cobrança, então quitar a cuota e o fundo juntos gera 2. Somados por moeda, sem converter
  ultimoPagamento: {
    data: string;
    quantidade: number;
    porMoeda: { moeda: MoedaTipo; valor: number }[];
    formas: FormaPagamentoTipo[];
  } | null;
  // total atualizado (com encargos) por faixa de dias de atraso; soma = divida.total
  antiguidade: { faixa: FaixaAntiguidade; valor: number; cobrancas: number }[];
  // um item por mês ("YYYY-MM") da janela, do mais antigo ao atual
  meses: {
    mes: string;
    estado: EstadoMesConta;
    cobrancas: { origem: string; estado: EstadoCobrancaConta; valor: number }[];
  }[];
  comportamento: {
    percentualEmDia: number | null;
    // média de dias depois do prazo, entre as cobranças da janela que foram pagas com atraso
    atrasoMedioDias: number | null;
    cobrancasPagasComAtraso: number;
    encargosPagos: number;
  };
  // o que está pendente, por origem (taxa ou rateio), com encargos de hoje
  composicao: { origem: string; cobrancas: number; total: number }[];
};

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);

const faixaDoAtraso = (diasAtraso: number): FaixaAntiguidade =>
  diasAtraso <= 0 ? "porVencer" : diasAtraso <= 30 ? "d1a30" : diasAtraso <= 60 ? "d31a60" : diasAtraso <= 90 ? "d61a90" : "mas90";

// ordem de prioridade para resumir um mês com várias cobranças: o que exige ação primeiro
const PRIORIDADE_MES: EstadoCobrancaConta[] = ["vencido", "porVencer", "conAtraso", "enDia"];

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

export type CobrancaClassificada = {
  estado: EstadoCobrancaConta | "cancelado";
  // vencimento + carência: a partir do dia seguinte incidem multa e juros
  prazo: string;
  encargos: Encargos;
  // pendente: saldo + encargos de hoje; paga: o que foi pago (principal + encargos + saldo a favor)
  valor: number;
  // dia (em Caracas) do último pagamento; null se não houve pagamento
  pagoEm: string | null;
  // só pra paga com atraso: dias entre o fim do prazo e o pagamento
  diasDepoisDoPrazo: number | null;
};

// fonte única da situação de uma cobrança, usada pelo estado de conta e pela lista de cobranças
export function classificarCobranca(c: CobrancaDaUnidade, hojeIso: string): CobrancaClassificada {
  const prazo = somarDias(c.data_vencimento, c.dias_graca);
  const encargos = calcularEncargos(c, hojeIso);
  const pagoEm = c.data_ultimo_pagamento ? dataCaixaCaracas(c.data_ultimo_pagamento) : null;

  if (c.status === "cancelado") {
    return { estado: "cancelado", prazo, encargos, valor: c.valor_usd, pagoEm, diasDepoisDoPrazo: null };
  }
  if (c.status === "pendente" && encargos.saldoDevedor > 0) {
    return {
      estado: encargos.diasAtraso > 0 ? "vencido" : "porVencer",
      prazo,
      encargos,
      valor: encargos.valorTotalComEncargos,
      pagoEm,
      diasDepoisDoPrazo: null,
    };
  }
  // paga: em dia se o último pagamento caiu até o fim do prazo (quitada só com saldo a favor não tem
  // pagamento e foi abatida na emissão, então também está em dia)
  const comAtraso = pagoEm !== null && pagoEm > prazo;
  return {
    estado: comAtraso ? "conAtraso" : "enDia",
    prazo,
    encargos,
    valor: c.valor_principal_pago_usd + c.valor_juros_pago_usd + c.valor_credito_abatido_usd,
    pagoEm,
    diasDepoisDoPrazo: comAtraso ? diasEntre(prazo, pagoEm) : null,
  };
}

export function calcularEstadoDeConta(cobrancas: CobrancaDaUnidade[], agora: Date): EstadoDeConta {
  // encargos usam a data UTC, como as listas de cobranças; pontualidade usa o dia em Caracas, como o Dashboard
  const hojeIso = agora.toISOString().slice(0, 10);
  const hojeCaracas = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(agora);
  const mesAtual = hojeCaracas.slice(0, 7);
  const [anoAtual, numeroMesAtual] = mesAtual.split("-").map(Number);
  const mesesJanela = Array.from({ length: MESES_ESTADO_CONTA }, (_, i) => {
    const data = new Date(Date.UTC(anoAtual, numeroMesAtual - 1 - (MESES_ESTADO_CONTA - 1 - i), 1));
    return data.toISOString().slice(0, 7);
  });
  const inicioJanela = mesesJanela[0];

  const divida = { principal: 0, encargos: 0, total: 0 };
  const antiguidade = new Map(FAIXAS_ANTIGUIDADE.map((f) => [f, { faixa: f, valor: 0, cobrancas: 0 }]));
  const composicao = new Map<string, { origem: string; cobrancas: number; total: number }>();
  const porMes = new Map(mesesJanela.map((m) => [m, [] as EstadoDeConta["meses"][number]["cobrancas"]]));
  let prazoVencidoMaisAntigo: string | null = null;
  let proximoVencimento: EstadoDeConta["proximoVencimento"] = null;
  const pagamentosPorDia = new Map<string, CobrancaDaUnidade["pagamentos"]>();
  const pontualidade = { base: 0, emDia: 0 };
  const atrasosPagos: number[] = [];
  let encargosPagos = 0;

  for (const c of cobrancas) {
    const classificada = classificarCobranca(c, hojeIso);
    if (classificada.estado === "cancelado") continue;
    const { estado, prazo, valor: valorExibido } = classificada;
    const mes = c.competencia.slice(0, 7);
    const naJanela = mes >= inicioJanela && mes <= mesAtual;

    for (const p of c.pagamentos) {
      const dia = dataCaixaCaracas(p.data_pagamento);
      pagamentosPorDia.set(dia, [...(pagamentosPorDia.get(dia) ?? []), p]);
    }

    if (estado === "vencido" || estado === "porVencer") {
      const e = classificada.encargos;
      divida.principal += e.saldoDevedor;
      divida.encargos += e.valorMulta + e.valorJuros;
      const faixa = antiguidade.get(faixaDoAtraso(e.diasAtraso))!;
      faixa.valor += e.valorTotalComEncargos;
      faixa.cobrancas += 1;
      const item = composicao.get(c.titulo_origem) ?? { origem: c.titulo_origem, cobrancas: 0, total: 0 };
      item.cobrancas += 1;
      item.total += e.valorTotalComEncargos;
      composicao.set(c.titulo_origem, item);

      if (estado === "vencido" && (!prazoVencidoMaisAntigo || prazo < prazoVencidoMaisAntigo)) {
        prazoVencidoMaisAntigo = prazo;
      }
      if (estado === "porVencer" && (!proximoVencimento || c.data_vencimento < proximoVencimento.data)) {
        proximoVencimento = { origem: c.titulo_origem, data: c.data_vencimento, valor: e.saldoDevedor };
      }
    } else if (naJanela && classificada.diasDepoisDoPrazo !== null) {
      atrasosPagos.push(classificada.diasDepoisDoPrazo);
    }

    if (naJanela) {
      porMes.get(mes)!.push({ origem: c.titulo_origem, estado, valor: valorExibido });
      encargosPagos += c.valor_juros_pago_usd;
      if (hojeCaracas > prazo) {
        pontualidade.base += c.valor_usd;
        pontualidade.emDia += c.valor_credito_abatido_usd;
        for (const p of c.pagamentos) {
          if (dataCaixaCaracas(p.data_pagamento) <= prazo) pontualidade.emDia += p.valor_principal_abatido_usd;
        }
      }
    }
  }

  divida.principal = arredondar(divida.principal);
  divida.encargos = arredondar(divida.encargos);
  divida.total = arredondar(divida.principal + divida.encargos);

  const situacao: SituacaoConta = prazoVencidoMaisAntigo ? "enAtraso" : divida.total > 0 ? "porVencer" : "alDia";

  const ultimoDia = [...pagamentosPorDia.keys()].sort().at(-1);
  const pagamentosDoUltimoDia = ultimoDia ? pagamentosPorDia.get(ultimoDia)! : [];
  const ultimoPagamento: EstadoDeConta["ultimoPagamento"] = ultimoDia
    ? {
        data: ultimoDia,
        quantidade: pagamentosDoUltimoDia.length,
        porMoeda: (["USD", "VES"] as const)
          .map((moeda) => ({
            moeda,
            valor: arredondar(
              pagamentosDoUltimoDia.filter((p) => p.moeda === moeda).reduce((acc, p) => acc + p.valor_recebido, 0),
            ),
          }))
          .filter((m) => pagamentosDoUltimoDia.some((p) => p.moeda === m.moeda)),
        formas: [...new Set(pagamentosDoUltimoDia.map((p) => p.forma_pagamento))],
      }
    : null;

  return {
    situacao,
    atrasoDesde: prazoVencidoMaisAntigo ? somarDias(prazoVencidoMaisAntigo, 1) : null,
    divida,
    proximoVencimento,
    ultimoPagamento,
    antiguidade: FAIXAS_ANTIGUIDADE.map((f) => {
      const item = antiguidade.get(f)!;
      return { ...item, valor: arredondar(item.valor) };
    }),
    meses: mesesJanela.map((mes) => {
      const lista = porMes.get(mes)!;
      const estado: EstadoMesConta =
        lista.length === 0 ? "sinCobros" : PRIORIDADE_MES.find((p) => lista.some((c) => c.estado === p))!;
      return { mes, estado, cobrancas: lista };
    }),
    comportamento: {
      percentualEmDia: percentualEmDia(pontualidade.base, pontualidade.emDia),
      atrasoMedioDias:
        atrasosPagos.length > 0 ? Math.round(atrasosPagos.reduce((a, d) => a + d, 0) / atrasosPagos.length) : null,
      cobrancasPagasComAtraso: atrasosPagos.length,
      encargosPagos: arredondar(encargosPagos),
    },
    composicao: [...composicao.values()]
      .map((item) => ({ ...item, total: arredondar(item.total) }))
      .sort((a, b) => b.total - a.total),
  };
}
