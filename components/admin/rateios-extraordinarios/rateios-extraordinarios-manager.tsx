"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

import { dataCaixaCaracas } from "@/lib/arrecadacao";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { ResumoProgresso, SituacaoProgresso } from "@/lib/progresso-cobranca";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RateioExtraordinarioFormDialog } from "@/components/admin/rateios-extraordinarios/rateio-extraordinario-form-dialog";

type DespesaComResumo = DespesaExtraordinaria & { resumo: ResumoProgresso };

type RateiosExtraordinariosManagerProps = {
  despesas: DespesaComResumo[];
  unidades: Unidade[];
};

const corDaSituacao: Record<SituacaoProgresso, string> = {
  concluido: "bg-primary",
  porVencer: "bg-muted-foreground/50",
  enCobro: "bg-destructive",
};

// rateio recém-cadastrado nesta tela, antes do refresh trazer o resumo do servidor: tudo a receber
const resumoDeNovoRateio = (d: DespesaExtraordinaria): ResumoProgresso => {
  const esperado = Math.round(d.valor_por_unidade_usd * d.unidade_ids.length * 100) / 100;
  return {
    situacao: "porVencer",
    esperado,
    recaudado: 0,
    encargosPagos: 0,
    porCobrar: esperado,
    cobrancas: d.unidade_ids.length,
    pagas: 0,
    pendentes: d.unidade_ids.length,
    vencidas: 0,
  };
};

export function RateiosExtraordinariosManager({ despesas, unidades }: RateiosExtraordinariosManagerProps) {
  const t = useTranslations("rateiosExtraordinarios");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const [despesasList, setDespesasList] = useState(despesas);

  // só cadastro: rateio emite as cobranças ao ser salvo e não é editável nem excluível depois
  const [formOpen, setFormOpen] = useState(false);

  const handleSaved = (despesa: DespesaExtraordinaria) => {
    // mais recente primeiro; o refresh traz o resumo de cobrança calculado no servidor
    setDespesasList((prev) => [{ ...despesa, resumo: resumoDeNovoRateio(despesa) }, ...prev]);
    router.refresh();
  };

  const totais = despesasList.reduce(
    (acc, d) => ({
      gasto: acc.gasto + d.valor_total_usd,
      esperado: acc.esperado + d.resumo.esperado,
      recaudado: acc.recaudado + d.resumo.recaudado,
      porCobrar: acc.porCobrar + d.resumo.porCobrar,
      pendentes: acc.pendentes + d.resumo.pendentes,
    }),
    { gasto: 0, esperado: 0, recaudado: 0, porCobrar: 0, pendentes: 0 },
  );
  const percentualRecaudado = totais.esperado > 0 ? (totais.recaudado / totais.esperado) * 100 : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
          <CardAction>
            <Button onClick={() => setFormOpen(true)}>
              <PlusIcon />
              {t("newRateio")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {despesasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRateios")}</p>
          ) : (
            <>
              {/* visão do ano: quanto as emergências custaram e quanto falta receber */}
              <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("summary.count", { count: despesasList.length })}</dt>
                  <dd className="font-medium tabular-nums">{formatUsd(totais.gasto)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("summary.collected")}</dt>
                  <dd className="font-medium tabular-nums">
                    {formatUsd(totais.recaudado)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({percentualRecaudado.toFixed(0)}%)
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("summary.toCollect")}</dt>
                  <dd className={cn("font-medium tabular-nums", totais.porCobrar > 0 && "text-destructive")}>
                    {formatUsd(totais.porCobrar)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("summary.pendingCharges")}</dt>
                  <dd className="font-medium tabular-nums">{totais.pendentes}</dd>
                </div>
              </dl>

              <ul className="divide-y rounded-lg border">
                {despesasList.map((despesa) => {
                  const r = despesa.resumo;
                  const href = `/rateios-extraordinarios/${despesa.id}`;
                  const progresso = r.esperado > 0 ? Math.min(100, (r.recaudado / r.esperado) * 100) : 0;
                  const participantes = despesa.unidade_ids.length;
                  return (
                    // a linha toda abre o detalhe; o menu para a propagação do clique
                    <li
                      key={despesa.id}
                      onClick={() => router.push(href)}
                      className="relative flex cursor-pointer flex-col gap-3 px-3 py-3 pr-12 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-6"
                    >
                      <div className="min-w-0 flex-1">
                        <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                          {despesa.titulo}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {t("row.registeredOn", { date: formatDate(dataCaixaCaracas(despesa.created_at)) })}
                          {" · "}
                          {t("row.dueOn", { date: formatDate(despesa.data_vencimento) })}
                          {" · "}
                          {participantes === unidades.length
                            ? t("row.allUnits", { count: participantes })
                            : t("row.someUnits", { count: participantes })}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:w-56">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", r.situacao === "concluido" ? "bg-primary" : "bg-primary/70")}
                            style={{ width: `${progresso}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("row.paidCount", { paid: r.pagas, total: r.cobrancas })}
                        </p>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 sm:w-48 sm:flex-col sm:items-end sm:gap-0.5">
                        <p className="font-medium tabular-nums">{formatUsd(despesa.valor_total_usd)}</p>
                        <p
                          className={cn(
                            "flex items-center gap-1.5 text-xs",
                            r.situacao === "enCobro" ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", corDaSituacao[r.situacao])} />
                          {r.situacao === "concluido"
                            ? t("row.done")
                            : t(`row.${r.situacao}`, { count: r.pendentes, value: formatUsd(r.porCobrar) })}
                        </p>
                      </div>

                      <div className="absolute top-2 right-2 sm:top-1/2 sm:-translate-y-1/2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />}
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem render={<Link href={href} />}>{t("viewProgress")}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* visíveis mas desabilitados, com o motivo: o rateio emite as cobranças no
                                cadastro, então editar ou excluir divergiria das cobranças (algumas já pagas).
                                Item desabilitado não recebe hover, por isso o motivo é texto, não tooltip */}
                            <DropdownMenuGroup>
                              <DropdownMenuLabel className="max-w-60 whitespace-normal">
                                {t("lockedActionsReason")}
                              </DropdownMenuLabel>
                              <DropdownMenuItem disabled>{tCommon("edit")}</DropdownMenuItem>
                              <DropdownMenuItem disabled variant="destructive">
                                {tCommon("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <RateioExtraordinarioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        unidades={unidades}
        onSaved={handleSaved}
      />
    </>
  );
}
