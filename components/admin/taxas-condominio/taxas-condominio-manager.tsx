"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import type { ResumoProgresso } from "@/lib/progresso-cobranca";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import { Badge } from "@/components/ui/badge";
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
  // percentuais vêm do banco como número cru (0.1): formata no idioma da tela (0,1)
  const formatPercentual = (valor: number) =>
    new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 4 }).format(valor);

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
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
          <CardAction>
            <Button onClick={openCreateDialog}>
              <PlusIcon />
              {t("newFee")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* a pergunta operacional do mês: falta emitir alguma cuota? */}
          {semEmissao.length > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm"
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
            <ul className="divide-y rounded-lg border">
              {taxasList.map((taxa) => {
                const s = situacoes[taxa.id] ?? SEM_SITUACAO;
                const href = `/taxas-condominio/${taxa.id}`;
                const pendenteDeEmissao = semEmissaoIds.includes(taxa.id);
                const ref = s.referencia;
                const progresso = ref && ref.resumo.esperado > 0 ? Math.min(100, (ref.resumo.recaudado / ref.resumo.esperado) * 100) : 0;
                return (
                  // a linha toda abre o detalhe; botões internos param a propagação do clique
                  <li
                    key={taxa.id}
                    onClick={() => router.push(href)}
                    className="relative flex cursor-pointer flex-col gap-3 px-3 py-3 pr-12 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                          {taxa.titulo}
                        </Link>
                        {!taxa.ativo && <Badge variant="outline">{t("inactive")}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("rulesLine", {
                          day: taxa.dia_vencimento,
                          units: s.unidadesVinculadas,
                          penalty: formatPercentual(taxa.pct_multa_atraso),
                          interest: formatPercentual(taxa.pct_juros_diario),
                          grace: taxa.dias_graca,
                        })}
                      </p>
                    </div>

                    {/* status do mês: emitir é a ação recorrente desta tela */}
                    <div className="flex flex-col gap-1.5 sm:w-64">
                      {pendenteDeEmissao ? (
                        <div className="flex items-center gap-2">
                          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <TriangleAlertIcon className="size-3.5 shrink-0" />
                            {t("monthNotIssued", { month: formatMesLongo(mesAtual) })}
                          </p>
                          <Button
                            size="xs"
                            nativeButton={false}
                            render={<Link href={href} onClick={(e) => e.stopPropagation()} />}
                          >
                            {t("issueAction")}
                          </Button>
                        </div>
                      ) : null}
                      {ref && (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${progresso}%` }} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("monthProgress", {
                              month: formatMesLongo(ref.mes),
                              paid: ref.resumo.pagas,
                              total: ref.resumo.cobrancas,
                              late: ref.comAtraso,
                            })}
                          </p>
                        </>
                      )}
                      {!ref && !pendenteDeEmissao && (
                        <p className="text-xs text-muted-foreground">{t("neverIssued")}</p>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between gap-3 sm:w-40 sm:flex-col sm:items-end sm:gap-0.5">
                      <p className="font-medium tabular-nums">{t("perUnit", { value: formatUsd(taxa.valor_usd) })}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t("perMonth", { value: formatUsd(taxa.valor_usd * s.unidadesVinculadas) })}
                      </p>
                    </div>

                    <div
                      className="absolute top-2 right-2 sm:top-1/2 sm:-translate-y-1/2"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
    </>
  );
}
