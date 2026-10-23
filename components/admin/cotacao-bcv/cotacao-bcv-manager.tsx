"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, RefreshCw } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { CotacaoBcv, CotacaoBcvConsulta } from "@/lib/types/cotacao-bcv";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import type { AnoMes } from "@/lib/mes";
import { formatBs, formatTasa } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoMes } from "@/components/admin/painel/cabecalho-mes";

// Resposta da Edge Function atualizar-cotacao-bcv (a mesma que o servidor chama quando a cotação atrasa)
type AtualizarCotacaoResponse = {
  cotacao: { dataCotacao: string; tasaVes: number; fuente: string };
};

type CotacaoBcvManagerProps = {
  anoMes: AnoMes;
  hoje: AnoMes;
  // cotações do mês exibido, da mais nova pra mais antiga
  cotacoes: CotacaoBcv[];
  // a última anterior ao mês, pra variação do primeiro dia dele
  anterior: CotacaoBcv | null;
  // as duas mais recentes de todas: a vigente e a anterior a ela (card de destaque)
  vigentes: CotacaoBcv[];
  consulta: CotacaoBcvConsulta | null;
};

export function CotacaoBcvManager({ anoMes, hoje, cotacoes, anterior, vigentes, consulta }: CotacaoBcvManagerProps) {
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

  const atual = vigentes[0] ?? null;

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

  const percentual = (de: CotacaoBcv, para: CotacaoBcv): number | null =>
    de.tasa_ves === 0 ? null : ((para.tasa_ves - de.tasa_ves) / de.tasa_ves) * 100;
  // variação de cada cotação do mês em relação à anterior; a do primeiro dia olha o mês anterior
  const variacaoDe = (indice: number): number | null => {
    const base = cotacoes[indice + 1] ?? anterior;
    return base ? percentual(base, cotacoes[indice]) : null;
  };
  const variacaoAtual = vigentes[1] && atual ? percentual(vigentes[1], atual) : null;
  const formatVariacao = (valor: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: "percent",
      signDisplay: "exceptZero",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor / 100);
  const mesFormatter = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });
  const mesLabel = mesFormatter.format(new Date(Date.UTC(anoMes.ano, anoMes.mes - 1, 1)));

  return (
    <div className="flex flex-col gap-4">
      {/* o mês é o título da barra (setas e grade de meses, como em Pagos); a taxa vigente e o botão de
          atualizar moram no card de destaque, que é sobre hoje */}
      <CabecalhoMes titulo={t("title")} ano={anoMes.ano} mes={anoMes.mes} hoje={hoje} basePath="/cotacao-bcv" />

      {/* a cotação que vale hoje, em destaque, independente do mês exibido: selo (âmbar se a última
          consulta falhou), a taxa grande, desde quando vale e a fonte, e a variação sobre a anterior */}
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
            {/* rodapé: a última ida à fonte e o botão de ir de novo, lado a lado */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3">
              <p className={cn("min-w-0 text-xs", consulta?.erro ? "text-destructive" : "text-muted-foreground")}>
                {consulta
                  ? consulta.erro
                    ? t("lastCheckError", {
                        date: dateTimeFormatter.format(new Date(consulta.consultado_em)),
                        error: consulta.erro,
                      })
                    : t("lastCheck", { date: dateTimeFormatter.format(new Date(consulta.consultado_em)) })
                  : null}
              </p>
              <Button variant="outline" size="sm" onClick={handleAtualizar} disabled={isUpdating}>
                <RefreshCw className={cn("size-3.5", isUpdating && "animate-spin")} />
                {isUpdating ? t("updating") : t("updateNow")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
          <Landmark className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noRates")}</p>
          <Button variant="outline" size="sm" onClick={handleAtualizar} disabled={isUpdating}>
            <RefreshCw className={cn("size-3.5", isUpdating && "animate-spin")} />
            {isUpdating ? t("updating") : t("updateNow")}
          </Button>
        </div>
      )}

      {/* o histórico do mês exibido, uma linha compacta por cotação com a variação diária */}
      {cotacoes.length === 0 ? (
        atual && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("emptyMonth", { month: mesLabel })}</p>
          </div>
        )
      ) : (
        <section aria-label={mesLabel} className="flex flex-col gap-3">
          <p className="px-1 text-sm text-muted-foreground tabular-nums">
            {t("monthCount", { count: cotacoes.length })}
          </p>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {cotacoes.map((cotacao, indice) => {
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
      )}
    </div>
  );
}
