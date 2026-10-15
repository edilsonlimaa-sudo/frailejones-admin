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

// acordo de pagamento que congela os juros da cobrança (migration acordos_pagamento): vigente,
// nada gera juros depois de data_inicio; quebrado, os juros voltam desde data_inicio, mas só
// sobre o principal que seguia em aberto em quebrado_em
export type AcordoParaEncargos = { data_inicio: string; quebrado_em: string | null };

export type CobrancaParaEncargos = RegrasEncargos & {
  status: CobrancaStatus;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  // pagamentos até a data de referência do cálculo
  pagamentos: PagamentoParaEncargos[];
  acordo: AcordoParaEncargos | null;
};

// um trecho de juros com a mesma base: no mensal, meses completos seguidos (de/ate = dias em que
// fecharam o primeiro e o último); no diário, dias entre dois pagamentos (de/ate = o intervalo).
// congelado: o trecho caiu no período de um acordo (base 0 se vigente, o que seguia em aberto na
// quebra se foi quebrado)
export type TrechoJuros = {
  de: string;
  ate: string;
  quantidade: number;
  base: number;
  valor: number;
  congelado: boolean;
};

// o passo a passo que levou aos encargos, pra explicar o valor na tela (os valores dos trechos
// não são arredondados: o total arredondado é o de Encargos)
export type MemoriaEncargos = {
  regras: RegrasEncargos;
  // diário: fim da carência, a partir de quando corre a multa e os juros
  prazo: string;
  multa: { base: number; valor: number } | null;
  trechos: TrechoJuros[];
  // multa/juros já quitados por pagamentos anteriores
  jaPago: number;
  // mensal: quando fecha o próximo mês e quanto ele acrescenta sobre o saldo de hoje
  proximoMes: { data: string; valor: number } | null;
  acordo: AcordoParaEncargos | null;
};

export type Encargos = {
  diasAtraso: number;
  saldoDevedor: number;
  // multa e juros ainda devidos (já descontado o que pagamentos anteriores quitaram)
  valorMulta: number;
  valorJuros: number;
  valorTotalComEncargos: number;
  // null quando a cobrança não tem encargos (paga, cancelada ou ainda no prazo)
  memoria: MemoriaEncargos | null;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// só as regras (a memória vai pra tela; não precisa carregar a cobrança inteira junto)
const regrasDe = (c: RegrasEncargos): RegrasEncargos => ({
  metodo_encargos: c.metodo_encargos,
  dias_graca: c.dias_graca,
  pct_multa_atraso: c.pct_multa_atraso,
  pct_juros_diario: c.pct_juros_diario,
  pct_juros_mensal: c.pct_juros_mensal,
  criterio_mes: c.criterio_mes,
});

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / MS_POR_DIA);

const menorData = (a: string, b: string) => (a < b ? a : b);
const maiorData = (a: string, b: string) => (a > b ? a : b);
const SEM_FIM = "9999-12-31";

// período congelado de um acordo e a base que vale dentro dele (null sem acordo)
type Congelamento = { inicio: string; fim: string; base: number };

function congelamentoDo(
  cobranca: CobrancaParaEncargos,
  pagamentos: { dia: string; principal: number }[],
): Congelamento | null {
  const { acordo } = cobranca;
  if (!acordo) return null;
  if (!acordo.quebrado_em) return { inicio: acordo.data_inicio, fim: SEM_FIM, base: 0 };
  const quebra = acordo.quebrado_em;
  const pagoAteQuebra = pagamentos.filter((p) => p.dia <= quebra).reduce((acc, p) => acc + p.principal, 0);
  return {
    inicio: acordo.data_inicio,
    fim: quebra,
    base: Math.max(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - pagoAteQuebra, 0),
  };
}

// os insumos têm no máximo 8 casas (valor 2 × juros 4 + /100), então o valor exato nunca fica a
// menos de 1e-6 centavo de um meio centavo; a folga de 1e-7 só absorve o erro do ponto flutuante e
// faz o arredondamento bater com o round(numeric, 2) do Postgres (meio centavo arredonda pra cima)
export const arredondarCentavos = (valor: number) => Math.round(valor * 100 + 1e-7) / 100;

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
    memoria: null,
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

  const baseMulta = Math.max(saldo, 0);

  const trechos: TrechoJuros[] = [];
  let desde = prazoIso;
  const congelamento = congelamentoDo(cobranca, pagamentos);
  // espelho de juros_diario_trecho: o trecho (desde, ate] é partido em antes, durante e depois do
  // período congelado do acordo, cada parte com a sua base
  const somarTrecho = (ate: string) => {
    const base = Math.max(saldo, 0);
    const partes = congelamento
      ? [
          { de: desde, ate: menorData(ate, congelamento.inicio), base, congelado: false },
          {
            de: maiorData(desde, congelamento.inicio),
            ate: menorData(ate, congelamento.fim),
            base: Math.min(base, congelamento.base),
            congelado: true,
          },
          { de: maiorData(desde, congelamento.fim), ate, base, congelado: false },
        ]
      : [{ de: desde, ate, base, congelado: false }];
    for (const parte of partes) {
      const dias = diasEntre(parte.de, parte.ate);
      if (dias <= 0 || base <= 0) continue;
      trechos.push({
        de: parte.de,
        ate: parte.ate,
        quantidade: dias,
        base: parte.base,
        valor: (parte.base * cobranca.pct_juros_diario * dias) / 100,
        congelado: parte.congelado,
      });
    }
  };
  for (const p of pagamentos.filter((p) => p.dia > prazoIso)) {
    somarTrecho(p.dia);
    saldo -= p.principal;
    desde = p.dia;
  }
  somarTrecho(dataReferenciaIso);
  const juros = arredondarCentavos(trechos.reduce((acc, t) => acc + t.valor, 0));

  const encargosPagos = cobranca.pagamentos.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0);
  const valorMulta = arredondarCentavos(Math.max(multa - encargosPagos, 0));
  const valorJuros = arredondarCentavos(Math.max(multa + juros - encargosPagos, 0) - valorMulta);

  return {
    diasAtraso,
    saldoDevedor,
    valorMulta,
    valorJuros,
    valorTotalComEncargos: arredondarCentavos(saldoDevedor + valorMulta + valorJuros),
    memoria: {
      regras: regrasDe(cobranca),
      prazo: prazoIso,
      multa: cobranca.pct_multa_atraso > 0 ? { base: baseMulta, valor: multa } : null,
      trechos,
      jaPago: encargosPagos,
      proximoMes: null,
      acordo: cobranca.acordo,
    },
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

  const congelamento = congelamentoDo(cobranca, pagamentos);
  const noAcordo = (fim: string) =>
    congelamento !== null && fim > congelamento.inicio && fim <= congelamento.fim;

  // meses seguidos com a mesma base viram um trecho só ("9 meses × 3% de $ 33,00")
  const trechos: TrechoJuros[] = [];
  let n = 1;
  for (; ; n++) {
    const fim = fimDoMesDeAtraso(cobranca.data_vencimento, cobranca.criterio_mes, n);
    if (fim > dataReferenciaIso) break;
    const abatido = pagamentos.filter((p) => p.dia < fim).reduce((acc, p) => acc + p.principal, 0);
    const emAberto = Math.max(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - abatido, 0);
    const congelado = noAcordo(fim);
    const base = congelado ? Math.min(emAberto, congelamento!.base) : emAberto;
    const valor = (base * cobranca.pct_juros_mensal) / 100;
    const ultimo = trechos.at(-1);
    if (ultimo && ultimo.congelado === congelado && arredondarCentavos(ultimo.base) === arredondarCentavos(base)) {
      ultimo.ate = fim;
      ultimo.quantidade += 1;
      ultimo.valor += valor;
    } else if (emAberto > 0) {
      trechos.push({ de: fim, ate: fim, quantidade: 1, base, valor, congelado });
    }
  }
  const juros = trechos.reduce((acc, t) => acc + t.valor, 0);

  const encargosPagos = cobranca.pagamentos.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0);
  const valorJuros = arredondarCentavos(Math.max(arredondarCentavos(juros) - encargosPagos, 0));

  return {
    diasAtraso: calcularDiasAtrasoNaData(cobranca.data_vencimento, 0, dataReferenciaIso),
    saldoDevedor,
    valorMulta: 0,
    valorJuros,
    valorTotalComEncargos: arredondarCentavos(saldoDevedor + valorJuros),
    memoria: {
      regras: regrasDe(cobranca),
      prazo: cobranca.data_vencimento,
      multa: null,
      trechos,
      jaPago: encargosPagos,
      acordo: cobranca.acordo,
      // com o acordo vigente o próximo mês não acrescenta nada
      proximoMes:
        cobranca.pct_juros_mensal > 0 &&
        !(noAcordo(fimDoMesDeAtraso(cobranca.data_vencimento, cobranca.criterio_mes, n)) && congelamento!.base === 0)
          ? {
              data: fimDoMesDeAtraso(cobranca.data_vencimento, cobranca.criterio_mes, n),
              valor: arredondarCentavos((saldoDevedor * cobranca.pct_juros_mensal) / 100),
            }
          : null,
    },
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
