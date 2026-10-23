"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, Receipt, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { ResumoProgresso } from "@/lib/progresso-cobranca";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarraResumo } from "@/components/admin/barra-resumo";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";
import { TaxaCondominioFormDialog } from "@/components/admin/taxas-condominio/taxa-condominio-form-dialog";

// situação operacional de cada cuota, calculada no servidor
export type SituacaoTaxa = {
  unidadesVinculadas: number;
  // com cobranças a cuota não pode ser excluída (o banco impede): só desativada
  temCobrancas: boolean;
  mesAtualEmitido: boolean;
  // mês de referência: o atual se já emitido, senão o último emitido (null = nunca emitida)
  referencia: { mes: string; resumo: ResumoProgresso; emDia: number; comAtraso: number } | null;
};

type TaxasCondominioManagerProps = {
  taxas: TaxaCondominio[];
  situacoes: Record<string, SituacaoTaxa>;
  // "YYYY-MM" do mês corrente em Caracas
  mesAtual: string;
  // cuotas ativas, com unidades, sem emissão no mês atual (aviso no topo)
  semEmissaoIds: string[];
};

// cuota recém-cadastrada nesta tela, antes do refresh trazer a situação do servidor
const SEM_SITUACAO: SituacaoTaxa = { unidadesVinculadas: 0, temCobrancas: false, mesAtualEmitido: false, referencia: null };

// estado do mês de cada cuota, que colore o selo do card: falta emitir (âmbar), em cobrança
// (azul), tudo pago (verde) ou nada a cobrar (cinza: inativa ou nunca emitida)
type EstadoDoMes = "emitir" | "emCobro" | "completo" | "inativa";
const tomDoEstado: Record<EstadoDoMes, string> = {
  emitir: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  emCobro: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  completo: "bg-primary/10 text-primary",
  inativa: "bg-muted text-muted-foreground",
};

export function TaxasCondominioManager({ taxas, situacoes, mesAtual, semEmissaoIds }: TaxasCondominioManagerProps) {
  const t = useTranslations("taxasCondominio");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatMesLongo = (mes: string) => {
    const texto = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${mes}-01T00:00:00Z`),
    );
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  };

  const [taxasList, setTaxasList] = useState(taxas);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTaxa, setEditingTaxa] = useState<TaxaCondominio | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TaxaCondominio | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortTaxas = (list: TaxaCondominio[]) =>
    [...list].sort((a, b) => {
      if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
      return a.titulo.localeCompare(b.titulo);
    });

  const openCreateDialog = () => {
    setEditingTaxa(null);
    setFormOpen(true);
  };

  const openEditDialog = (taxa: TaxaCondominio) => {
    setEditingTaxa(taxa);
    setFormOpen(true);
  };

  const handleSaved = (taxa: TaxaCondominio) => {
    setTaxasList((prev) => {
      const exists = prev.some((t) => t.id === taxa.id);
      const next = exists ? prev.map((t) => (t.id === taxa.id ? taxa : t)) : [...prev, taxa];
      return sortTaxas(next);
    });
    // situação (unidades, emissão do mês) vem do servidor
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const supabase = createClient();
    setIsDeleting(true);

    try {
      const { error } = await supabase.from("taxa_condominio").delete().eq("id", deleteTarget.id);
      if (error) throw error;

      setTaxasList((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success(t("deleteSuccess"));
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  const semEmissao = taxasList.filter((taxa) => semEmissaoIds.includes(taxa.id));

  return (
    <div className="flex flex-col gap-4">
      <BarraResumo
        titulo={t("title")}
        resumo={t("barSummary", { count: taxasList.length, active: taxasList.filter((taxa) => taxa.ativo).length })}
        acao={
          <Button onClick={openCreateDialog}>
            <PlusIcon />
            {t("newFee")}
          </Button>
        }
      />

          {/* a pergunta operacional do mês: falta emitir alguma cuota? */}
          {semEmissao.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>
                {t("notIssuedAlert", { count: semEmissao.length, month: formatMesLongo(mesAtual) })}{" "}
                {semEmissao.map((taxa, i) => (
                  <span key={taxa.id}>
                    {i > 0 && ", "}
                    <Link href={`/taxas-condominio/${taxa.id}`} className="font-medium underline underline-offset-2">
                      {taxa.titulo}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          )}

          {taxasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noFees")}</p>
          ) : (
            // um card por cuota: regras em cima, situação do mês no meio, valores embaixo
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {taxasList.map((taxa) => {
                const s = situacoes[taxa.id] ?? SEM_SITUACAO;
                const href = `/taxas-condominio/${taxa.id}`;
                const pendenteDeEmissao = semEmissaoIds.includes(taxa.id);
                const ref = s.referencia;
                const progresso = ref && ref.resumo.esperado > 0 ? Math.min(100, (ref.resumo.recaudado / ref.resumo.esperado) * 100) : 0;
                const estado: EstadoDoMes = !taxa.ativo
                  ? "inativa"
                  : pendenteDeEmissao
                    ? "emitir"
                    : ref
                      ? progresso >= 100
                        ? "completo"
                        : "emCobro"
                      : "inativa";
                return (
                  <li key={taxa.id}>
                  {/* o card todo abre o detalhe; botões internos param a propagação do clique */}
                  <Card
                    size="sm"
                    onClick={() => router.push(href)}
                    className="relative h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
                  >
                  <CardContent className="flex h-full flex-col gap-4">
                    {/* cabeçalho: selo na cor do estado do mês, título e o essencial (valor e vencimento).
                        As regras de multa e juros ficam no detalhe: aqui só o que se lê de relance */}
                    <div className="flex items-start gap-3 pr-8">
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-xl",
                          tomDoEstado[estado],
                        )}
                      >
                        <Receipt className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xl leading-tight font-bold tracking-tight hover:underline"
                          >
                            {taxa.titulo}
                          </Link>
                          {!taxa.ativo && <Badge variant="outline">{t("inactive")}</Badge>}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground tabular-nums">{formatUsd(taxa.valor_usd)}</span>{" "}
                          {t("perUnitShort")}
                          {" · "}
                          {t("dueDay", { day: taxa.dia_vencimento })}
                        </p>
                      </div>
                    </div>

                    {/* o mês: a pergunta operacional desta tela. Anel com o % arrecadado, contagem e
                        atraso; ou, se falta emitir, o chamado pra emitir */}
                    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                      {pendenteDeEmissao ? (
                        <>
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                            <TriangleAlertIcon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{t("monthNotIssued", { month: formatMesLongo(mesAtual) })}</p>
                            <p className="text-xs text-muted-foreground">{t("issueHint")}</p>
                          </div>
                          <Button
                            size="sm"
                            nativeButton={false}
                            render={<Link href={href} onClick={(e) => e.stopPropagation()} />}
                          >
                            {t("issueAction")}
                          </Button>
                        </>
                      ) : ref ? (
                        <>
                          <AnelProgresso percentual={progresso} rotulo={t("collected")} tamanho={56} espessura={6} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">{formatMesLongo(ref.mes)}</p>
                            <p className="text-sm font-medium">
                              {t("paidOf", { paid: ref.resumo.pagas, total: ref.resumo.cobrancas })}
                            </p>
                            <p className={cn("text-xs", ref.comAtraso > 0 ? "text-destructive" : "text-primary")}>
                              {ref.comAtraso > 0 ? t("lateCount", { count: ref.comAtraso }) : t("noLate")}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("neverIssued")}</p>
                      )}
                    </div>

                    {/* rodapé: alcance e o que a cuota representa por mês */}
                    <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-sm">
                      <span className="text-muted-foreground">{t("unitsCount", { count: s.unidadesVinculadas })}</span>
                      <span className="font-semibold tabular-nums">
                        {t("perMonth", { value: formatUsd(taxa.valor_usd * s.unidadesVinculadas) })}
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
                          <DropdownMenuItem render={<Link href={href} />}>{t("viewDetails")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(taxa)}>{tCommon("edit")}</DropdownMenuItem>
                          {s.temCobrancas ? (
                            // visível mas desabilitado, com o motivo: o banco não deixa excluir cuota com
                            // cobranças (elas perderiam a origem). Pra parar de cobrar, desativa-se
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="max-w-60 whitespace-normal">
                                  {t("deleteLockedReason")}
                                </DropdownMenuLabel>
                                <DropdownMenuItem disabled variant="destructive">
                                  {tCommon("delete")}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </>
                          ) : (
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(taxa)}>
                              {tCommon("delete")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </Card>
                  </li>
                );
              })}
            </ul>
          )}

      <TaxaCondominioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        taxa={editingTaxa}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { titulo: deleteTarget?.titulo ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
