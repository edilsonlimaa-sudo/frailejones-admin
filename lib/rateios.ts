import { formatUsd } from "@/lib/moeda";

// o valor por unidade é o total dividido e arredondado em 2 casas (formulário do rateio), então o
// que as unidades pagam somado pode diferir do total em alguns centavos (ex.: $ 1.000 / 24 =
// $ 41,67 → $ 1.000,08). Devolve essa diferença (positiva = cobrado a mais), em centavos exatos.
export function diferencaArredondamento(
  valorTotal: number,
  valorPorUnidade: number,
  unidades: number,
): number {
  return Math.round(valorPorUnidade * unidades * 100 - valorTotal * 100) / 100;
}

// "+ $ 0,08" / "− $ 0,01"
export function formatDiferenca(diferenca: number): string {
  return `${diferenca > 0 ? "+" : "−"} ${formatUsd(Math.abs(diferenca))}`;
}
