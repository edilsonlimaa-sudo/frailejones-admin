import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { FAIXAS_ATRASO, faixaDoAtraso, type FaixaAtraso, type ResumoDivida } from "@/lib/painel/divida";
import { formatUsd, formatVes } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// escala quente: quanto mais antigo o atraso, mais difícil de recuperar
const corFaixa: Record<FaixaAtraso, { barra: string; texto: string }> = {
  aVencer: { barra: "bg-muted-foreground/30", texto: "bg-muted text-muted-foreground" },
  ate30: { barra: "bg-amber-400", texto: "bg-amber-400/15 text-amber-700 dark:text-amber-300" },
  ate60: { barra: "bg-orange-500", texto: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  ate90: { barra: "bg-red-500", texto: "bg-red-500/15 text-red-700 dark:text-red-300" },
  mais90: { barra: "bg-red-800 dark:bg-red-700", texto: "bg-red-800/15 text-red-800 dark:text-red-300" },
};

const MAIORES_DEVEDORES = 5;

export async function CartaoDivida({ divida, tasaVes }: { divida: ResumoDivida; tasaVes: number | null }) {
  const t = await getTranslations("dashboard.focus.debt");
  const tDashboard = await getTranslations("dashboard");

  if (divida.unidades.length === 0) {
    return (
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  const pct = (valor: number) => (divida.total > 0 ? (valor / divida.total) * 100 : 0);
  const maiores = divida.unidades.slice(0, MAIORES_DEVEDORES);
  const maiorValor = maiores[0]?.total ?? 0;

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("total")}</p>
            <p className="text-3xl font-semibold tracking-tight text-destructive tabular-nums">
              {formatUsd(divida.total)}
            </p>
            {tasaVes && (
              <p className="text-xs text-muted-foreground tabular-nums">{formatVes(divida.total, tasaVes)}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                {t("principal")} <span className="font-medium text-foreground tabular-nums">{formatUsd(divida.principal)}</span>
              </span>
              <span className="text-muted-foreground">
                {t("charges")} <span className="font-medium text-foreground tabular-nums">{formatUsd(divida.encargos)}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="text-xs font-medium">{t("aging")}</p>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {FAIXAS_ATRASO.filter((f) => divida.porFaixa[f].valor > 0).map((f) => (
                <div
                  key={f}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", corFaixa[f].barra)}
                  style={{ width: `${pct(divida.porFaixa[f].valor)}%` }}
                />
              ))}
            </div>
            <ul className="flex flex-col gap-1.5">
              {FAIXAS_ATRASO.map((f) => {
                const faixa = divida.porFaixa[f];
                return (
                  <li
                    key={f}
                    className={cn("flex items-center gap-2 text-xs", faixa.quantidade === 0 && "opacity-45")}
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", corFaixa[f].barra)} />
                    <span className="flex-1 text-muted-foreground">{t(`buckets.${f}`)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {t("agingCount", { count: faixa.quantidade })}
                    </span>
                    <span className="w-24 text-right font-medium tabular-nums">{formatUsd(faixa.valor)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:border-l md:pl-6">
          <p className="text-xs font-medium">{t("top")}</p>
          <ul className="flex flex-col gap-3">
            {maiores.map((u) => {
              const faixa = faixaDoAtraso(u.maxDiasAtraso);
              const conteudo = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {u.identificacao ?? tDashboard("unitRemoved")}
                        {u.proprietario && (
                          <span className="font-normal text-muted-foreground"> · {u.proprietario}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatUsd(u.total)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", corFaixa[faixa].barra)}
                        style={{ width: `${maiorValor > 0 ? (u.total / maiorValor) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {t("topCharges", { count: u.cobrancas })}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        corFaixa[faixa].texto,
                      )}
                    >
                      {u.maxDiasAtraso > 0 ? t("daysShort", { count: u.maxDiasAtraso }) : t("onTime")}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={u.id || "removida"}>
                  {u.id ? (
                    <Link
                      href={`/unidades/${u.id}?aba=cobrancas`}
                      className="-mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted/50"
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-1.5 py-1">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-auto self-start"
            nativeButton={false}
            render={<Link href="/unidades?situacion=enAtraso&orden=deuda" />}
          >
            {t("viewAll")}
            <ArrowRightIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
