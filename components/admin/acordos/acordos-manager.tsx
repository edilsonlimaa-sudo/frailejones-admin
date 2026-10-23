"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import type { ResumoAcordo, SituacaoAcordo } from "@/lib/acordos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { AcordoPagamento } from "@/lib/types/acordos";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BarraResumo } from "@/components/admin/barra-resumo";
import { classesDoChip } from "@/components/admin/chip";

export type AcordoListado = AcordoPagamento & {
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  resumo: ResumoAcordo;
};

type Filtro = "todos" | SituacaoAcordo;
const FILTROS: Filtro[] = ["todos", "vigente", "cumprido", "quebrado"];

const VARIANTE_SITUACAO: Record<SituacaoAcordo, "default" | "secondary" | "destructive"> = {
  vigente: "default",
  cumprido: "secondary",
  quebrado: "destructive",
};

// todos os acordos de pagamento do condomínio: quem está em acordo, quanto já pagou, quanto falta
// e quanto de juros o acordo está segurando. Registrar fica na aba de acordos da unidade; quebrar,
// na página do acordo.
export function AcordosManager({ acordos }: { acordos: AcordoListado[] }) {
  const t = useTranslations("acordosPage");
  const tAcordos = useTranslations("acordos");
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  // abre nos vigentes: são os que pedem acompanhamento
  const [filtro, setFiltro] = useState<Filtro>(acordos.some((a) => a.resumo.situacao === "vigente") ? "vigente" : "todos");

  const contagem = (f: Filtro) => (f === "todos" ? acordos.length : acordos.filter((a) => a.resumo.situacao === f).length);
  const listados = filtro === "todos" ? acordos : acordos.filter((a) => a.resumo.situacao === filtro);
  const vigentes = acordos.filter((a) => a.resumo.situacao === "vigente");
  const somaVigentes = (valor: (r: ResumoAcordo) => number) => vigentes.reduce((acc, a) => acc + valor(a.resumo), 0);

  return (
    <div className="flex flex-col gap-4">
      <BarraResumo
        titulo={t("title")}
        resumo={t("barSummary", { active: vigentes.length, value: formatUsd(somaVigentes((r) => r.falta)) })}
      >
        {/* filtro por situação, com a contagem de cada uma, preso junto com o resumo */}
        <div
          role="group"
          aria-label={t("filterLabel")}
          className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={classesDoChip(filtro === f)}
            >
              {t(`filter.${f}`, { count: contagem(f) })}
            </button>
          ))}
        </div>
      </BarraResumo>

        {acordos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            {/* o que os acordos vigentes representam hoje */}
            <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t("summary.active")}</dt>
                <dd className="font-medium tabular-nums">{vigentes.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("summary.paid")}</dt>
                <dd className="font-medium tabular-nums">{formatUsd(somaVigentes((r) => r.pago))}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("summary.remaining")}</dt>
                <dd className={cn("font-medium tabular-nums", somaVigentes((r) => r.falta) > 0 && "text-destructive")}>
                  {formatUsd(somaVigentes((r) => r.falta))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("summary.frozen")}</dt>
                <dd className="font-medium tabular-nums text-primary">
                  {formatUsd(somaVigentes((r) => r.jurosEvitados))}
                </dd>
              </div>
            </dl>

            {listados.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("emptyFilter")}</p>
            ) : (
              // um card por acordo: unidade e dono em cima, progresso no meio, o que falta embaixo
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {listados.map((acordo) => {
                  const r = acordo.resumo;
                  const href = `/acordos/${acordo.id}`;
                  return (
                    <li key={acordo.id}>
                    {/* o card todo abre a página do acordo */}
                    <Card
                      size="sm"
                      onClick={() => router.push(href)}
                      className="h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
                    >
                    <CardContent className="flex h-full flex-col gap-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          {/* a unidade leva pra aba de acordos dela; o resto da linha, pro acordo */}
                          {acordo.unidade ? (
                            <Link
                              href={`/unidades/${acordo.unidade.id}?aba=acordos`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-lg leading-tight font-semibold tracking-tight hover:underline"
                            >
                              {acordo.unidade.identificacao}
                            </Link>
                          ) : (
                            <span className="font-medium">—</span>
                          )}
                          {acordo.unidade?.proprietario && (
                            <span className="truncate text-sm text-muted-foreground">
                              {acordo.unidade.proprietario.nome}
                            </span>
                          )}
                          <Badge variant={VARIANTE_SITUACAO[r.situacao]}>{tAcordos(`status.${r.situacao}`)}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("row.since", { date: formatDate(acordo.data_inicio) })}
                          {" · "}
                          {t("row.charges", { count: r.cobrancas })}
                          {acordo.quebrado_em && ` · ${t("row.brokenOn", { date: formatDate(acordo.quebrado_em) })}`}
                        </p>
                        {acordo.observacao && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground italic">{acordo.observacao}</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${r.progresso}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("row.paid", { value: formatUsd(r.pago), pct: Math.round(r.progresso) })}
                        </p>
                      </div>

                      <div className="mt-auto flex items-baseline justify-between gap-3">
                        <p className={cn("text-lg leading-tight font-semibold tabular-nums", r.falta > 0 && "text-destructive")}>
                          {r.falta > 0 ? formatUsd(r.falta) : t("row.nothingLeft")}
                        </p>
                        {r.falta > 0 && <p className="text-xs text-muted-foreground">{t("row.remaining")}</p>}
                      </div>
                    </CardContent>
                    </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
    </div>
  );
}
