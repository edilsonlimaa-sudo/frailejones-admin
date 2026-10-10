"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { formatUsd } from "@/lib/moeda";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type PontoEvolucao = {
  mes: string;
  rotulo: string;
  emitido: number;
  quitado: number;
  // % do emitido no mês pago até vencimento + carência; null se nenhum prazo do mês acabou ainda
  emDia: number | null;
};

type EvolucaoArrecadacaoChartProps = {
  dados: PontoEvolucao[];
  labels: { emitido: string; quitado: string; emDia: string };
};

const formatEixo = new Intl.NumberFormat("es-VE", { notation: "compact", maximumFractionDigits: 1 });

export function EvolucaoArrecadacaoChart({ dados, labels }: EvolucaoArrecadacaoChartProps) {
  const config = {
    emitido: { label: labels.emitido, color: "var(--chart-2)" },
    quitado: { label: labels.quitado, color: "var(--primary)" },
    emDia: { label: labels.emDia, color: "var(--chart-4)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <ComposedChart data={dados} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          yAxisId="usd"
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(valor: number) => `$${formatEixo.format(valor)}`}
        />
        {/* pontualidade em %, eixo próprio pra não achatar a linha contra os valores em dólar */}
        <YAxis
          yAxisId="pct"
          orientation="right"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(valor: number) => `${valor}%`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(valor, nome, item) => (
                <div className="flex w-full items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: item.color ?? item.payload?.fill }}
                  />
                  <span className="flex-1 text-muted-foreground">
                    {config[nome as keyof typeof config]?.label ?? nome}
                  </span>
                  <span className="ml-4 font-medium tabular-nums">
                    {nome === "emDia" ? `${Math.round(Number(valor))}%` : formatUsd(Number(valor))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="usd" dataKey="emitido" fill="var(--color-emitido)" radius={4} />
        <Bar yAxisId="usd" dataKey="quitado" fill="var(--color-quitado)" radius={4} />
        <Line
          yAxisId="pct"
          dataKey="emDia"
          type="monotone"
          stroke="var(--color-emDia)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-emDia)" }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
