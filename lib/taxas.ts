// Regras das cuotas de condomínio (taxas recorrentes) compartilhadas pela listagem, pelo detalhe
// e pelo Dashboard.

// abas do detalhe de uma cuota, guardadas na URL como ?aba=
export const ABAS_TAXA = ["emision", "unidades"] as const;
export type AbaTaxa = (typeof ABAS_TAXA)[number];
export const ABA_TAXA_PADRAO: AbaTaxa = "emision";

export function resolverAbaTaxa(valor: string | string[] | undefined): AbaTaxa {
  return ABAS_TAXA.find((aba) => aba === valor) ?? ABA_TAXA_PADRAO;
}

// "YYYY-MM" do mês corrente em Caracas (a emissão é mensal no calendário do condomínio)
export function mesAtualCaracas(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(agora).slice(0, 7);
}

// vencimento da cuota numa competência: o dia_vencimento, limitado ao último dia do mês
// (ex.: dia 31 em fevereiro → 28/29)
export function vencimentoDaCompetencia(diaVencimento: number, mes: string): string {
  const [ano, numeroMes] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate();
  return `${mes}-${String(Math.min(diaVencimento, ultimoDia)).padStart(2, "0")}`;
}

export type TaxaParaEmissao = {
  id: string;
  titulo: string;
  ativo: boolean;
  unidadesVinculadas: number;
  // competências ("YYYY-MM-01") já fechadas pra esta cuota
  competenciasEmitidas: string[];
};

// cuota que deveria ter cobrança no mês e ainda não teve: ativa, com unidades vinculadas e sem a
// competência fechada (faturamentos_competencia). Usado no aviso da listagem e do Dashboard
export function taxasSemEmissaoNoMes(taxas: TaxaParaEmissao[], mes: string): TaxaParaEmissao[] {
  return taxas.filter(
    (t) => t.ativo && t.unidadesVinculadas > 0 && !t.competenciasEmitidas.includes(`${mes}-01`),
  );
}
