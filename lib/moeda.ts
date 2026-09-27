const vesNumberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// fonte única de conversão/formatação USD -> VES (bolívares), usando a cotação BCV do dia
export function formatVes(valorUsd: number, tasaVes: number): string {
  return `Bs. ${vesNumberFormatter.format(valorUsd * tasaVes)}`;
}

export type CotacaoHistorico = { data_cotacao: string; tasa_ves: number };

// acha a cotação vigente numa data (a mais recente com data_cotacao <= dataIso); `cotacoes`
// precisa vir ordenada desc por data_cotacao. Usado pra congelar o Bs. exibido de cobranças já
// pagas na cotação do dia da liquidação, em vez de reconverter sempre pela cotação mais recente.
export function encontrarTasaNaData(cotacoes: CotacaoHistorico[], dataIso: string): number | null {
  return cotacoes.find((c) => c.data_cotacao <= dataIso)?.tasa_ves ?? null;
}

