import { dataCaixaCaracas } from "@/lib/arrecadacao";
import { calcularEncargos, type CobrancaParaEncargos } from "@/lib/encargos";

// Números de um acordo de pagamento a partir das cobranças vinculadas a ele, usados pela aba de
// acordos da unidade e pela listagem de acordos.

export type SituacaoAcordo = "vigente" | "cumprido" | "quebrado";

type AcordoBase = { data_inicio: string; quebrado_em: string | null };

// o que a cobrança deve hoje (cota em aberto + multa/juros de hoje); 0 se já foi paga
export const faltaHoje = (c: CobrancaParaEncargos, hojeIso: string) =>
  c.status === "pendente" ? calcularEncargos(c, hojeIso).valorTotalComEncargos : 0;

// o que a cobrança devia num dia passado: só os pagamentos feitos até ele contam
export const devidoNaData = (c: CobrancaParaEncargos, dataIso: string) =>
  calcularEncargos(
    {
      ...c,
      status: "pendente",
      pagamentos: c.pagamentos.filter((p) => dataCaixaCaracas(p.data_pagamento) <= dataIso),
    },
    dataIso,
  ).valorTotalComEncargos;

// pagamentos feitos depois do início do acordo (cota + multa/juros)
export const pagoNoAcordo = (c: CobrancaParaEncargos, acordo: AcordoBase) =>
  c.pagamentos
    .filter((p) => dataCaixaCaracas(p.data_pagamento) > acordo.data_inicio)
    .reduce((acc, p) => acc + p.valor_principal_abatido_usd + p.valor_juros_pago_usd, 0);

// quanto de juros o acordo já evitou hoje: o devido sem acordo menos o devido com ele
export const jurosEvitados = (c: CobrancaParaEncargos, hojeIso: string) =>
  c.status === "pendente"
    ? calcularEncargos({ ...c, acordo: null }, hojeIso).valorTotalComEncargos - faltaHoje(c, hojeIso)
    : 0;

export type ResumoAcordo = {
  situacao: SituacaoAcordo;
  cobrancas: number;
  devidoNoInicio: number;
  pago: number;
  falta: number;
  // só no acordo vigente; 0 nos outros
  jurosEvitados: number;
  // % do que o acordo já recebeu sobre o total (pago + falta)
  progresso: number;
};

// cumprido não tem coluna: é o acordo não quebrado cujas cobranças já foram todas pagas
export function resumirAcordo(acordo: AcordoBase, cobrancas: CobrancaParaEncargos[], hojeIso: string): ResumoAcordo {
  const soma = (valor: (c: CobrancaParaEncargos) => number) => cobrancas.reduce((acc, c) => acc + valor(c), 0);
  const situacao: SituacaoAcordo = acordo.quebrado_em
    ? "quebrado"
    : cobrancas.some((c) => c.status === "pendente")
      ? "vigente"
      : "cumprido";
  const pago = soma((c) => pagoNoAcordo(c, acordo));
  const falta = soma((c) => faltaHoje(c, hojeIso));
  return {
    situacao,
    cobrancas: cobrancas.length,
    devidoNoInicio: soma((c) => devidoNaData(c, acordo.data_inicio)),
    pago,
    falta,
    jurosEvitados: situacao === "vigente" ? soma((c) => jurosEvitados(c, hojeIso)) : 0,
    progresso: pago + falta > 0 ? (pago / (pago + falta)) * 100 : 100,
  };
}
