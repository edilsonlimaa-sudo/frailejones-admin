"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardHat, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

import { dataCaixaCaracas } from "@/lib/arrecadacao";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { ResumoProgresso, SituacaoProgresso } from "@/lib/progresso-cobranca";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarraResumo } from "@/components/admin/barra-resumo";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";
import { RateioExtraordinarioFormDialog } from "@/components/admin/rateios-extraordinarios/rateio-extraordinario-form-dialog";

type DespesaComResumo = DespesaExtraordinaria & { resumo: ResumoProgresso };

type RateiosExtraordinariosManagerProps = {
  despesas: DespesaComResumo[];
  unidades: Unidade[];
};

// selo do card, na cor da situação da cobrança: tudo pago (verde), no prazo (azul), vencido (vermelho)
const tomDaSituacao: Record<SituacaoProgresso, string> = {
  concluido: "bg-primary/10 text-primary",
  porVencer: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  enCobro: "bg-destructive/10 text-destructive",
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
    <div className="flex flex-col gap-4">
      <BarraResumo
        titulo={t("title")}
        resumo={t("barSummary", {
          count: despesasList.length,
          percent: Math.round(percentualRecaudado),
          value: formatUsd(totais.porCobrar),
        })}
        acao={
          <Button onClick={() => setFormOpen(true)}>
            <PlusIcon />
            {t("newRateio")}
          </Button>
        }
      />

          {despesasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRateios")}</p>
          ) : (
            <>
              {/* um card por prorrateo: título e datas em cima, progresso no meio, total embaixo */}
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {despesasList.map((despesa) => {
                  const r = despesa.resumo;
                  const href = `/rateios-extraordinarios/${despesa.id}`;
                  const progresso = r.esperado > 0 ? Math.min(100, (r.recaudado / r.esperado) * 100) : 0;
                  const participantes = despesa.unidade_ids.length;
                  return (
                    <li key={despesa.id}>
                    {/* o card todo abre o detalhe; o menu para a propagação do clique */}
                    <Card
                      size="sm"
                      onClick={() => router.push(href)}
                      className="relative h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
                    >
                    <CardContent className="flex h-full flex-col gap-4">
                      {/* cabeçalho: selo na cor da situação da cobrança, título e o essencial (total e
                          vencimento); o menu ⋯ fica no canto (absolute), por isso o espaço à direita */}
                      <div className="flex items-start gap-3 pr-8">
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-xl",
                            tomDaSituacao[r.situacao],
                          )}
                        >
                          <HardHat className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xl leading-tight font-bold tracking-tight hover:underline"
                          >
                            {despesa.titulo}
                          </Link>
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground tabular-nums">{formatUsd(despesa.valor_total_usd)}</span>{" "}
                            {t("card.total")}
                            {" · "}
                            {t("row.dueOn", { date: formatDate(despesa.data_vencimento) })}
                          </p>
                        </div>
                      </div>

                      {/* a cobrança: anel com o % arrecadado, contagem de pagos e o que falta */}
                      <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                        <AnelProgresso percentual={progresso} rotulo={t("card.collected")} tamanho={56} espessura={6} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{t("row.paidCount", { paid: r.pagas, total: r.cobrancas })}</p>
                          <p
                            className={cn(
                              "text-xs",
                              r.situacao === "enCobro"
                                ? "text-destructive"
                                : r.situacao === "concluido"
                                  ? "text-primary"
                                  : "text-muted-foreground",
                            )}
                          >
                            {r.situacao === "concluido"
                              ? t("row.done")
                              : t(`row.${r.situacao}`, { count: r.pendentes, value: formatUsd(r.porCobrar) })}
                          </p>
                        </div>
                      </div>

                      {/* rodapé: quando entrou e quem participa; à direita, quanto coube a cada unidade */}
                      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {t("row.registeredOn", { date: formatDate(dataCaixaCaracas(despesa.created_at)) })}
                          {" · "}
                          {participantes === unidades.length
                            ? t("row.allUnits", { count: participantes })
                            : t("row.someUnits", { count: participantes })}
                        </span>
                        <span className="shrink-0 font-medium text-foreground tabular-nums">
                          {t("card.perUnit", { value: formatUsd(despesa.valor_por_unidade_usd) })}
                        </span>
                      </div>
                    </CardContent>

                      <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
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
                    </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

      <RateioExtraordinarioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        unidades={unidades}
        onSaved={handleSaved}
      />
    </div>
  );
}
