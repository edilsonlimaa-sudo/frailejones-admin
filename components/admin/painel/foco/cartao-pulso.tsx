import Link from "next/link";
import { ArrowRightIcon, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { RecaudacaoDoMes } from "@/components/admin/painel/recaudacao-do-mes";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";
import { formatDiferenca } from "@/lib/rateios";
import { formatUsd } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CartaoPulsoProps = {
  mesLabel: string;
  recaudacao: RecaudacaoDoMes;
  cobrancasEmitidas: number;
  pendentes: { quantidade: number; valor: number };
  emAtraso: { quantidade: number; valor: number };
  diferencaRedondeo: number;
  // pontualidade do mês anterior, pra comparar (null se não houver)
  emDiaAnterior: { percentual: number; mesLabel: string } | null;
};

// o "norte" do mês: quanto do emitido já virou dinheiro. Um número grande (% arrecadado), o valor
// absoluto ao lado e a decomposição numa barra só — o resto do painel detalha
export async function CartaoPulso({
  mesLabel,
  recaudacao,
  cobrancasEmitidas,
  pendentes,
  emAtraso,
  diferencaRedondeo,
  emDiaAnterior,
}: CartaoPulsoProps) {
  const t = await getTranslations("dashboard.focus.pulse");

  const quitado = recaudacao.quitadoNoMes + recaudacao.quitadoDepois;
  const pct = (valor: number) =>
    recaudacao.emitido > 0 ? Math.min(100, (valor / recaudacao.emitido) * 100) : 0;
  const segmentos = [
    { chave: "noMes", valor: recaudacao.quitadoNoMes, cor: "bg-primary" },
    { chave: "depois", valor: recaudacao.quitadoDepois, cor: "bg-primary/45" },
    { chave: "emAberto", valor: recaudacao.emAberto, cor: "bg-muted-foreground/25" },
  ] as const;

  const emDia = recaudacao.percentualEmDia;
  const delta =
    emDia !== null && emDiaAnterior ? Math.round(emDia) - Math.round(emDiaAnterior.percentual) : null;

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="first-letter:uppercase">{t("title", { month: mesLabel })}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {recaudacao.emitido === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/taxas-condominio" />}>
              {t("emptyAction")}
              <ArrowRightIcon />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
              <AnelProgresso percentual={pct(quitado)} rotulo={t("collected")} />
              <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                <div className="text-center sm:text-left">
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatUsd(quitado)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("ofIssued", { value: formatUsd(recaudacao.emitido) })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:text-emerald-300">
                    {emDia === null ? t("onTimePending") : t("onTime", { percent: Math.round(emDia) })}
                  </span>
                  {delta !== null && emDiaAnterior && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                        delta > 0 && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        delta < 0 && "bg-destructive/10 text-destructive",
                        delta === 0 && "bg-muted text-muted-foreground",
                      )}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="size-3.5" />
                      ) : delta < 0 ? (
                        <TrendingDown className="size-3.5" />
                      ) : (
                        <Minus className="size-3.5" />
                      )}
                      {delta > 0
                        ? t("deltaUp", { points: delta, month: emDiaAnterior.mesLabel })
                        : delta < 0
                          ? t("deltaDown", { points: Math.abs(delta), month: emDiaAnterior.mesLabel })
                          : t("deltaSame", { month: emDiaAnterior.mesLabel })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {segmentos.map((s) => (
                  <div key={s.chave} className={cn("h-full", s.cor)} style={{ width: `${pct(s.valor)}%` }} />
                ))}
              </div>
              <dl className="grid grid-cols-3 gap-2">
                {segmentos.map((s) => (
                  <div key={s.chave} className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("size-2 shrink-0 rounded-full", s.cor)} />
                      <span className="truncate">{t(`rows.${s.chave}`)}</span>
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{formatUsd(s.valor)}</dd>
                  </div>
                ))}
              </dl>
              {diferencaRedondeo !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("rounding", { diff: formatDiferenca(diferencaRedondeo) })}
                </p>
              )}
            </div>
          </>
        )}

        <dl className="mt-auto grid grid-cols-3 divide-x rounded-xl bg-muted/50 py-3 text-center">
          <div className="px-2">
            <dt className="text-xs text-muted-foreground">{t("charges")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{cobrancasEmitidas}</dd>
            <dd className="truncate text-[11px] text-muted-foreground tabular-nums">
              {formatUsd(recaudacao.emitido)}
            </dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-muted-foreground">{t("pending")}</dt>
            <dd className="text-lg font-semibold tabular-nums">{pendentes.quantidade}</dd>
            <dd className="truncate text-[11px] text-muted-foreground tabular-nums">{formatUsd(pendentes.valor)}</dd>
          </div>
          <div className="px-2">
            <dt className="text-xs text-muted-foreground">{t("overdue")}</dt>
            <dd
              className={cn(
                "text-lg font-semibold tabular-nums",
                emAtraso.quantidade > 0 && "text-destructive",
              )}
            >
              {emAtraso.quantidade}
            </dd>
            <dd className="truncate text-[11px] text-muted-foreground tabular-nums">{formatUsd(emAtraso.valor)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
