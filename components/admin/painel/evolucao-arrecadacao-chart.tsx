"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
};

type EvolucaoArrecadacaoChartProps = {
  dados: PontoEvolucao[];
  labels: { emitido: string; quitado: string };
};

const formatEixo = new Intl.NumberFormat("es-VE", { notation: "compact", maximumFractionDigits: 1 });

export function EvolucaoArrecadacaoChart({ dados, labels }: EvolucaoArrecadacaoChartProps) {
  const config = {
    emitido: { label: labels.emitido, color: "var(--chart-2)" },
    quitado: { label: labels.quitado, color: "var(--primary)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={dados} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(valor: number) => `$${formatEixo.format(valor)}`}
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
                  <span className="ml-4 font-medium tabular-nums">{formatUsd(Number(valor))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="emitido" fill="var(--color-emitido)" radius={4} />
        <Bar dataKey="quitado" fill="var(--color-quitado)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
