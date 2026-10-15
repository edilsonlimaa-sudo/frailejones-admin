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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
// e quanto de juros o acordo está segurando. Registrar e quebrar ficam na aba de acordos da unidade.
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
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {acordos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            {/* o que os acordos vigentes representam hoje */}
            <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
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

            <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
              {FILTROS.map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filtro === f ? "secondary" : "ghost"}
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                >
                  {t(`filter.${f}`, { count: contagem(f) })}
                </Button>
              ))}
            </div>

            {listados.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("emptyFilter")}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {listados.map((acordo) => {
                  const r = acordo.resumo;
                  const href = acordo.unidade ? `/unidades/${acordo.unidade.id}?aba=acordos` : null;
                  return (
                    // a linha toda abre a aba de acordos da unidade
                    <li
                      key={acordo.id}
                      onClick={href ? () => router.push(href) : undefined}
                      className={cn(
                        "flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-6",
                        href && "cursor-pointer transition-colors hover:bg-muted/50",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          {href ? (
                            <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                              {acordo.unidade!.identificacao}
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

                      <div className="flex flex-col gap-1.5 sm:w-56">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${r.progresso}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("row.paid", { value: formatUsd(r.pago), pct: Math.round(r.progresso) })}
                        </p>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 sm:w-44 sm:flex-col sm:items-end sm:gap-0.5">
                        <p className={cn("font-medium tabular-nums", r.falta > 0 && "text-destructive")}>
                          {r.falta > 0 ? formatUsd(r.falta) : t("row.nothingLeft")}
                        </p>
                        {r.falta > 0 && <p className="text-xs text-muted-foreground">{t("row.remaining")}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
