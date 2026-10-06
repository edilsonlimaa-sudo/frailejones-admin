import type { MoedaTipo } from "@/lib/types/creditos";

// es-VE e pt-BR usam o mesmo formato numérico (1.234,56), então um formatter serve pros dois
// locales. Não usamos style: "currency" do Intl: em es-VE ele mostra "USD" e o símbolo antigo
// "Bs.S", e em pt-BR mostra "VES" — diferente de como dólar e bolívar são escritos no dia a dia.
const numberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const SIMBOLO_MOEDA: Record<MoedaTipo, string> = { USD: "$", VES: "Bs." };

// sobra de pagamento abaixo disso (equivalente em dólar) não vira saldo a favor: fica absorvida
// no pagamento. Tem que ser igual a c_sobra_minima_usd em liquidar_cobranca (migration
// 20261006120000_funcoes_transacionais_creditos.sql), que é quem aplica a regra de fato.
export const SOBRA_MINIMA_USD = 1;

export function formatUsd(valor: number): string {
  return `$ ${numberFormatter.format(valor)}`;
}

export function formatBs(valor: number): string {
  return `Bs. ${numberFormatter.format(valor)}`;
}

export function formatMoeda(valor: number, moeda: MoedaTipo): string {
  return moeda === "USD" ? formatUsd(valor) : formatBs(valor);
}

// cotação BCV: quantos bolívares vale 1 dólar
export function formatTasa(tasaVes: number): string {
  return `${formatBs(tasaVes)} / $`;
}

// fonte única de conversão/formatação USD -> VES (bolívares), usando a cotação BCV do dia
export function formatVes(valorUsd: number, tasaVes: number): string {
  return formatBs(valorUsd * tasaVes);
}

export type CotacaoHistorico = { data_cotacao: string; tasa_ves: number };

// acha a cotação vigente numa data (a mais recente com data_cotacao <= dataIso); `cotacoes`
// precisa vir ordenada desc por data_cotacao. Usado pra congelar o Bs. exibido de cobranças já
// pagas na cotação do dia da liquidação, em vez de reconverter sempre pela cotação mais recente.
export function encontrarTasaNaData(cotacoes: CotacaoHistorico[], dataIso: string): number | null {
  return cotacoes.find((c) => c.data_cotacao <= dataIso)?.tasa_ves ?? null;
}
