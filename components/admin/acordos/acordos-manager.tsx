"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { ResumoAcordo, SituacaoAcordo } from "@/lib/acordos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { AcordoPagamento } from "@/lib/types/acordos";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AvatarIniciais } from "@/components/admin/avatar-iniciais";
import { BarraResumo } from "@/components/admin/barra-resumo";
import { classesDoChip } from "@/components/admin/chip";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";

export type AcordoListado = AcordoPagamento & {
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  resumo: ResumoAcordo;
};

type Filtro = "todos" | SituacaoAcordo;
const FILTROS: Filtro[] = ["todos", "vigente", "cumprido", "quebrado"];

// selo do card, na cor da situação do acordo
const tomDoAcordo: Record<SituacaoAcordo, string> = {
  vigente: "bg-primary/10 text-primary",
  cumprido: "bg-muted text-muted-foreground",
  quebrado: "bg-destructive/10 text-destructive",
};

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

  const [busca, setBusca] = useState("");

  const contagem = (f: Filtro) => (f === "todos" ? acordos.length : acordos.filter((a) => a.resumo.situacao === f).length);
  const termo = busca.trim().toLocaleLowerCase();
  const listados = acordos
    .filter((a) => filtro === "todos" || a.resumo.situacao === filtro)
    .filter(
      (a) =>
        !termo ||
        [a.unidade?.identificacao, a.unidade?.proprietario?.nome, a.observacao].some((campo) =>
          campo?.toLocaleLowerCase().includes(termo),
        ),
    );
  const vigentes = acordos.filter((a) => a.resumo.situacao === "vigente");
  const somaVigentes = (valor: (r: ResumoAcordo) => number) => vigentes.reduce((acc, a) => acc + valor(a.resumo), 0);

  return (
    <div className="flex flex-col gap-4">
      <BarraResumo
        titulo={t("title")}
        resumo={t("barSummary", {
          active: vigentes.length,
          value: formatUsd(somaVigentes((r) => r.falta)),
          frozen: formatUsd(somaVigentes((r) => r.jurosEvitados)),
        })}
      >
        <div className="pb-3">
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-10 bg-card"
          />
        </div>
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
                      {/* cabeçalho: selo na cor da situação, unidade grande (leva pra aba de acordos dela) e
                          dono com avatar; o resto do card leva pro acordo */}
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-xl",
                            tomDoAcordo[r.situacao],
                          )}
                        >
                          <Handshake className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            {acordo.unidade ? (
                              <Link
                                href={`/unidades/${acordo.unidade.id}?aba=acordos`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xl leading-tight font-bold tracking-tight hover:underline"
                              >
                                {acordo.unidade.identificacao}
                              </Link>
                            ) : (
                              <span className="text-xl leading-tight font-bold">—</span>
                            )}
                            <Badge variant={VARIANTE_SITUACAO[r.situacao]}>{tAcordos(`status.${r.situacao}`)}</Badge>
                          </p>
                          {acordo.unidade?.proprietario && (
                            <div className="mt-1 flex min-w-0 items-center gap-1.5">
                              <AvatarIniciais nome={acordo.unidade.proprietario.nome} className="size-5 text-[9px]" />
                              <span className="truncate text-sm text-muted-foreground">
                                {acordo.unidade.proprietario.nome}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* o andamento: anel com o % pago, pago sobre o total e o que falta */}
                      <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                        <AnelProgresso percentual={r.progresso} rotulo={t("card.paidLabel")} tamanho={56} espessura={6} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {t("card.paidOf", { paid: formatUsd(r.pago), total: formatUsd(r.pago + r.falta) })}
                          </p>
                          <p className={cn("text-xs", r.falta > 0 ? "text-destructive" : "text-primary")}>
                            {r.falta > 0 ? t("card.remaining", { value: formatUsd(r.falta) }) : t("row.nothingLeft")}
                          </p>
                          {acordo.quebrado_em && (
                            <p className="text-xs text-muted-foreground">
                              {t("row.brokenOn", { date: formatDate(acordo.quebrado_em) })}
                            </p>
                          )}
                        </div>
                      </div>

                      {acordo.observacao && (
                        <p className="truncate text-xs text-muted-foreground italic">{acordo.observacao}</p>
                      )}

                      {/* rodapé: desde quando e quantas cobranças; à direita, os juros que o acordo segura */}
                      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {t("row.since", { date: formatDate(acordo.data_inicio) })}
                          {" · "}
                          {t("row.charges", { count: r.cobrancas })}
                        </span>
                        {r.jurosEvitados > 0 && (
                          <span className="shrink-0 font-medium text-primary tabular-nums">
                            {t("card.frozen", { value: formatUsd(r.jurosEvitados) })}
                          </span>
                        )}
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
