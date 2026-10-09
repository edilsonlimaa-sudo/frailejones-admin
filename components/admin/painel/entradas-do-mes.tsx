import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { ResumoEntradas } from "@/lib/arrecadacao";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";
import { SIMBOLO_MOEDA, formatBs, formatMoeda, formatUsd } from "@/lib/moeda";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EntradasDoMesProps = {
  resumo: ResumoEntradas;
  // "YYYY-MM", repassado pro filtro de Liquidações
  mes: string;
};

function percentual(parte: number, total: number) {
  return total > 0 ? (parte / total) * 100 : 0;
}

export async function EntradasDoMes({ resumo, mes }: EntradasDoMesProps) {
  const t = await getTranslations("dashboard.entries");
  const tForma = await getTranslations("liquidacoes.paymentMethod");

  const formaLabel = (forma: FormaPagamentoTipo) => tForma(forma);

  const composicao = [
    { chave: "doMes", valor: resumo.principalDoMes, cor: "var(--primary)" },
    { chave: "atrasado", valor: resumo.principalAtrasado, cor: "var(--chart-3)" },
    { chave: "adiantado", valor: resumo.principalAdiantado, cor: "var(--chart-4)" },
    { chave: "encargos", valor: resumo.encargos, cor: "var(--destructive)" },
    { chave: "sobra", valor: resumo.sobra, cor: "var(--chart-1)" },
  ] as const;
  // "adiantado" é raro (pagar cobrança de competência futura): só aparece quando existe
  const linhasComposicao = composicao.filter((c) => c.chave !== "adiantado" || c.valor > 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/liquidacoes?mes=${mes}`} />}
        >
          {t("viewPayments")}
          <ArrowRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("totalReceived")}</CardDescription>
            <CardTitle className="text-xl">{formatUsd(resumo.totalUsd)}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("paymentsCount", { count: resumo.quantidade })}
            </p>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("receivedUsd")}</CardDescription>
            <CardTitle className="text-xl">{formatUsd(resumo.recebidoUsd)}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("receivedUsdDescription")}</p>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("receivedVes")}</CardDescription>
            <CardTitle className="text-xl">{formatBs(resumo.recebidoVes)}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("approxUsd", { value: formatUsd(resumo.recebidoVesEmUsd) })}
            </p>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("recoveredOverdue")}</CardDescription>
            <CardTitle className="text-xl">{formatUsd(resumo.principalAtrasado)}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("recoveredOverdueDescription")}</p>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("byMethodTitle")}</CardTitle>
            <CardDescription>{t("byMethodDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {resumo.canais.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {resumo.canais.map((canal) => (
                  <li key={`${canal.forma}:${canal.moeda}`} className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {formaLabel(canal.forma)}
                          {/* transferência existe nas duas moedas: são contas diferentes */}
                          {canal.forma === "transferencia" && ` (${SIMBOLO_MOEDA[canal.moeda]})`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("paymentsCount", { count: canal.quantidade })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium tabular-nums">
                          {formatMoeda(canal.valorRecebido, canal.moeda)}
                        </p>
                        {canal.moeda === "VES" && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {t("approxUsd", { value: formatUsd(canal.valorUsd) })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percentual(canal.valorUsd, resumo.totalUsd)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("compositionTitle")}</CardTitle>
            <CardDescription>{t("compositionDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {resumo.totalUsd === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noEntries")}</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {linhasComposicao.map((c) => (
                    <div
                      key={c.chave}
                      className="h-full"
                      style={{
                        width: `${percentual(c.valor, resumo.totalUsd)}%`,
                        backgroundColor: c.cor,
                      }}
                    />
                  ))}
                </div>
                <ul className="flex flex-col gap-2.5">
                  {linhasComposicao.map((c) => (
                    <li key={c.chave} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: c.cor }}
                      />
                      <span className="flex-1 text-muted-foreground">
                        {t(`composition.${c.chave}`)}
                      </span>
                      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                        {percentual(c.valor, resumo.totalUsd).toFixed(0)}%
                      </span>
                      <span className="w-24 text-right font-medium tabular-nums">
                        {formatUsd(c.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
