"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { CotacaoBcv, CotacaoBcvConsulta } from "@/lib/types/cotacao-bcv";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import { formatBs, formatTasa } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TOP_ABAIXO_DA_BARRA, VIDRO } from "@/components/admin/barra-fixa";
import { BarraResumo } from "@/components/admin/barra-resumo";

// Resposta da Edge Function atualizar-cotacao-bcv (a mesma que o servidor chama quando a cotação atrasa)
type AtualizarCotacaoResponse = {
  cotacao: { dataCotacao: string; tasaVes: number; fuente: string };
};

type CotacaoBcvManagerProps = {
  cotacoes: CotacaoBcv[];
  consulta: CotacaoBcvConsulta | null;
};

export function CotacaoBcvManager({ cotacoes, consulta }: CotacaoBcvManagerProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const t = useTranslations("cotacaoBcvPage");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" });
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO_CARACAS,
  });
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

  const atual = cotacoes[0] ?? null;

  const handleAtualizar = async () => {
    setIsUpdating(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke<AtualizarCotacaoResponse>(
        "atualizar-cotacao-bcv",
      );

      if (error) {
        // a função responde { error } com o motivo (fontes fora do ar, variação suspeita etc.)
        const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(body?.error ?? t("errorFetchApi"));
      }
      if (!data) throw new Error(t("errorInvalidRate"));

      toast.success(t("updateSuccess", { rate: formatTasa(data.cotacao.tasaVes) }));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("updateError"));
    } finally {
      setIsUpdating(false);
    }
  };

  // variação de cada cotação em relação à anterior (a lista vem da mais nova pra mais antiga)
  const variacaoDe = (indice: number): number | null => {
    const anterior = cotacoes[indice + 1];
    if (!anterior || anterior.tasa_ves === 0) return null;
    return ((cotacoes[indice].tasa_ves - anterior.tasa_ves) / anterior.tasa_ves) * 100;
  };
  const formatVariacao = (valor: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: "percent",
      signDisplay: "exceptZero",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor / 100);

  // histórico agrupado por mês, na ordem da lista (mais recente primeiro)
  const meses: { mes: string; itens: { cotacao: CotacaoBcv; indice: number }[] }[] = [];
  cotacoes.forEach((cotacao, indice) => {
    const mes = cotacao.data_cotacao.slice(0, 7);
    const grupo = meses.at(-1);
    if (grupo && grupo.mes === mes) grupo.itens.push({ cotacao, indice });
    else meses.push({ mes, itens: [{ cotacao, indice }] });
  });
  const mesFormatter = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
  const formatMes = (mes: string) => {
    const texto = mesFormatter.format(new Date(`${mes}-01T00:00:00Z`));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };
  const variacaoAtual = variacaoDe(0);

  return (
    <div className="flex flex-col gap-4">
      <BarraResumo
        titulo={t("title")}
        resumo={
          atual ? (
            <>
              <span className="font-semibold text-foreground tabular-nums">{formatBs(atual.tasa_ves)}</span>
              {" · "}
              {t("barCurrent", { date: formatDate(atual.data_cotacao) })}
            </>
          ) : (
            t("noRatesShort")
          )
        }
        acao={
          <Button onClick={handleAtualizar} disabled={isUpdating}>
            {isUpdating ? t("updating") : t("updateNow")}
          </Button>
        }
      />

      {/* a cotação que vale hoje, em destaque: selo (âmbar se a última consulta falhou), a taxa
          grande, desde quando vale e a fonte, e a variação sobre a anterior */}
      {atual ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  consulta?.erro
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-primary/10 text-primary",
                )}
              >
                <Landmark className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t("currentRate")}</p>
                <p className="text-3xl leading-tight font-bold tracking-tight tabular-nums">{formatBs(atual.tasa_ves)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("barCurrent", { date: formatDate(atual.data_cotacao) })}
                  {" · "}
                  {atual.fuente}
                </p>
              </div>
              {variacaoAtual !== null && (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                  {formatVariacao(variacaoAtual)}
                </span>
              )}
            </div>
            {consulta && (
              <p className={cn("border-t pt-3 text-xs", consulta.erro ? "text-destructive" : "text-muted-foreground")}>
                {consulta.erro
                  ? t("lastCheckError", {
                      date: dateTimeFormatter.format(new Date(consulta.consultado_em)),
                      error: consulta.erro,
                    })
                  : t("lastCheck", { date: dateTimeFormatter.format(new Date(consulta.consultado_em)) })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
          <Landmark className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noRates")}</p>
        </div>
      )}

      {/* histórico por mês: o cabeçalho do mês gruda abaixo da barra enquanto as cotações dele rolam */}
      {meses.length > 0 && (
        <div className="flex flex-col gap-6">
          {meses.map((grupo) => (
            <section key={grupo.mes} aria-label={formatMes(grupo.mes)} className="flex flex-col gap-3">
              <div
                style={{ top: TOP_ABAIXO_DA_BARRA }}
                className={cn("sticky z-[5] -mx-4 flex items-baseline justify-between gap-3 px-5 py-2 text-sm", VIDRO)}
              >
                <span className="font-semibold">{formatMes(grupo.mes)}</span>
                <span className="text-muted-foreground tabular-nums">{t("monthCount", { count: grupo.itens.length })}</span>
              </div>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {grupo.itens.map(({ cotacao, indice }) => {
                  const variacao = variacaoDe(indice);
                  return (
                    <li
                      key={cotacao.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{formatDate(cotacao.data_cotacao)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {cotacao.fuente}
                          {" · "}
                          {t("updatedAt")} {dateTimeFormatter.format(new Date(cotacao.created_at))}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{formatBs(cotacao.tasa_ves)}</p>
                        {variacao !== null && (
                          <p className="text-xs text-muted-foreground tabular-nums">{formatVariacao(variacao)}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
