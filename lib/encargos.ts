import { dataCaixaCaracas } from "@/lib/arrecadacao";
import type { CobrancaStatus } from "@/lib/types/cobrancas";

// pagamento (parcial ou total) já registrado numa cobrança, com o que ele abateu
export type PagamentoParaEncargos = {
  data_pagamento: string;
  valor_principal_abatido_usd: number;
  // multa + juros que este pagamento quitou
  valor_juros_pago_usd: number;
};

// diario: multa única + juros ao dia, com carência. mensal: só juros, por mês completo de atraso
// contado do vencimento, sem multa nem carência (migration juros_mensais)
export type MetodoEncargos = "diario" | "mensal";
// quando fecha um "mês completo" no método mensal
export type CriterioMes = "dias_corridos" | "mesmo_dia";

// regras de encargos de uma taxa, rateio ou cobrança (congeladas na cobrança na emissão); cada
// método só usa os próprios campos e os do outro ficam zerados
export type RegrasEncargos = {
  metodo_encargos: MetodoEncargos;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  pct_juros_mensal: number;
  criterio_mes: CriterioMes;
};

export type CobrancaParaEncargos = RegrasEncargos & {
  status: CobrancaStatus;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  // pagamentos até a data de referência do cálculo
  pagamentos: PagamentoParaEncargos[];
};

export type Encargos = {
  diasAtraso: number;
  saldoDevedor: number;
  // multa e juros ainda devidos (já descontado o que pagamentos anteriores quitaram)
  valorMulta: number;
  valorJuros: number;
  valorTotalComEncargos: number;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / MS_POR_DIA);

// os insumos têm no máximo 8 casas (valor 2 × juros 4 + /100), então o valor exato nunca fica a
// menos de 1e-6 centavo de um meio centavo; a folga de 1e-7 só absorve o erro do ponto flutuante e
// faz o arredondamento bater com o round(numeric, 2) do Postgres (meio centavo arredonda pra cima)
const arredondarCentavos = (valor: number) => Math.round(valor * 100 + 1e-7) / 100;

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

// fonte única do cálculo de encargos nas telas, espelho de calcular_encargos_cobranca no banco
// (migration encargos_calculados_no_banco), que é quem vale na liquidação. No método diário,
// com o fim da carência como "prazo" e o dia de cada pagamento em Caracas:
//   - multa: uma vez só, sobre o principal que ainda estava em aberto no prazo;
//   - juros simples ao dia, só sobre o principal em aberto em cada trecho entre pagamentos;
//   - devido = multa + juros acumulados até a data - o que pagamentos anteriores já quitaram
//     (pagamento quita encargos antes do principal, então o abatido vai primeiro pra multa).
export function calcularEncargos(cobranca: CobrancaParaEncargos, dataReferenciaIso: string): Encargos {
  const principalPago = cobranca.pagamentos.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0);
  const saldoDevedor = Math.max(
    arredondarCentavos(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - principalPago),
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

  if (cobranca.metodo_encargos === "mensal") {
    return calcularJurosMensais(cobranca, dataReferenciaIso, saldoDevedor);
  }

  const diasAtraso = calcularDiasAtrasoNaData(cobranca.data_vencimento, cobranca.dias_graca, dataReferenciaIso);

  if (diasAtraso <= 0) {
    return semEncargos;
  }

  const prazo = new Date(`${cobranca.data_vencimento}T00:00:00Z`);
  prazo.setUTCDate(prazo.getUTCDate() + cobranca.dias_graca);
  const prazoIso = prazo.toISOString().slice(0, 10);

  const pagamentos = cobranca.pagamentos
    .map((p) => ({ dia: dataCaixaCaracas(p.data_pagamento), principal: p.valor_principal_abatido_usd }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  let saldo =
    cobranca.valor_usd -
    cobranca.valor_credito_abatido_usd -
    pagamentos.filter((p) => p.dia <= prazoIso).reduce((acc, p) => acc + p.principal, 0);
  const multa = arredondarCentavos((Math.max(saldo, 0) * cobranca.pct_multa_atraso) / 100);

  let juros = 0;
  let desde = prazoIso;
  for (const p of pagamentos.filter((p) => p.dia > prazoIso)) {
    juros += (Math.max(saldo, 0) * cobranca.pct_juros_diario * diasEntre(desde, p.dia)) / 100;
    saldo -= p.principal;
    desde = p.dia;
  }
  juros += (Math.max(saldo, 0) * cobranca.pct_juros_diario * diasEntre(desde, dataReferenciaIso)) / 100;
  juros = arredondarCentavos(juros);

  const encargosPagos = cobranca.pagamentos.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0);
  const valorMulta = arredondarCentavos(Math.max(multa - encargosPagos, 0));
  const valorJuros = arredondarCentavos(Math.max(multa + juros - encargosPagos, 0) - valorMulta);

  return {
    diasAtraso,
    saldoDevedor,
    valorMulta,
    valorJuros,
    valorTotalComEncargos: arredondarCentavos(saldoDevedor + valorMulta + valorJuros),
  };
}

// dia em que fecha o n-ésimo mês de atraso no método mensal, sempre contado a partir do
// vencimento (não do mês anterior): "mesmo_dia" com vencimento 31/01 fecha em 28/02, 31/03...,
// como o date + interval 'n month' do Postgres
export function fimDoMesDeAtraso(dataVencimento: string, criterio: CriterioMes, n: number): string {
  const vencimento = new Date(`${dataVencimento}T00:00:00Z`);
  if (criterio === "dias_corridos") {
    vencimento.setUTCDate(vencimento.getUTCDate() + 30 * n);
    return vencimento.toISOString().slice(0, 10);
  }
  const ano = vencimento.getUTCFullYear();
  const mes = vencimento.getUTCMonth() + n;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(vencimento.getUTCDate(), ultimoDia))).toISOString().slice(0, 10);
}

// método mensal, espelho do ramo 'mensal' de calcular_encargos_cobranca: a cada mês completo de
// atraso, pct_juros_mensal sobre o principal em aberto no dia em que o mês fecha (pagamento desse
// mesmo dia ainda paga aquele mês). Sem multa e sem carência.
function calcularJurosMensais(
  cobranca: CobrancaParaEncargos,
  dataReferenciaIso: string,
  saldoDevedor: number,
): Encargos {
  const pagamentos = cobranca.pagamentos.map((p) => ({
    dia: dataCaixaCaracas(p.data_pagamento),
    principal: p.valor_principal_abatido_usd,
  }));

  let juros = 0;
  for (let n = 1; ; n++) {
    const fim = fimDoMesDeAtraso(cobranca.data_vencimento, cobranca.criterio_mes, n);
    if (fim > dataReferenciaIso) break;
    const abatido = pagamentos.filter((p) => p.dia < fim).reduce((acc, p) => acc + p.principal, 0);
    const emAberto = Math.max(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - abatido, 0);
    juros += (emAberto * cobranca.pct_juros_mensal) / 100;
  }

  const encargosPagos = cobranca.pagamentos.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0);
  const valorJuros = arredondarCentavos(Math.max(arredondarCentavos(juros) - encargosPagos, 0));

  return {
    diasAtraso: calcularDiasAtrasoNaData(cobranca.data_vencimento, 0, dataReferenciaIso),
    saldoDevedor,
    valorMulta: 0,
    valorJuros,
    valorTotalComEncargos: arredondarCentavos(saldoDevedor + valorJuros),
  };
}

// pagamentos de uma cobrança a partir do embed pagamento_cobrancas(..., pagamento:pagamentos(data_pagamento))
export function pagamentosParaEncargos(
  linhas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[],
): PagamentoParaEncargos[] {
  return linhas
    .filter((l) => l.pagamento !== null)
    .map((l) => ({
      data_pagamento: l.pagamento!.data_pagamento,
      valor_principal_abatido_usd: l.valor_principal_abatido_usd,
      valor_juros_pago_usd: l.valor_juros_pago_usd,
    }));
}

// regras como parâmetros das funções que emitem cobranças (emitir_cobrancas_taxa e
// salvar_rateio_extraordinario), que as congelam em cada cobrança
export function paramsRegrasEncargos(regras: RegrasEncargos) {
  return {
    p_metodo_encargos: regras.metodo_encargos,
    p_pct_multa_atraso: regras.pct_multa_atraso,
    p_pct_juros_diario: regras.pct_juros_diario,
    p_dias_graca: regras.dias_graca,
    p_pct_juros_mensal: regras.pct_juros_mensal,
    p_criterio_mes: regras.criterio_mes,
  };
}
