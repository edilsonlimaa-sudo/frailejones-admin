"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { formatUsd } from "@/lib/moeda";

type TaxasCondominioManagerProps = {
  taxas: TaxaCondominio[];
};

export function TaxasCondominioManager({ taxas }: TaxasCondominioManagerProps) {
  const t = useTranslations("taxasCondominio");
  const tCommon = useTranslations("common");
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
        <CardContent>
          {taxasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noFees")}</p>
          ) : (
            <>
              {/* mobile: lista de cards (tabela com 8 colunas não cabe bem em telas pequenas) */}
              <div className="flex flex-col gap-3 sm:hidden">
                {taxasList.map((taxa) => (
                  <div key={taxa.id} className="rounded-lg border border-input p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/taxas-condominio/${taxa.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {taxa.titulo}
                      </Link>
                      <div className="flex items-center gap-1">
                        <Badge variant={taxa.ativo ? "default" : "outline"}>
                          {taxa.ativo ? tCommon("yes") : tCommon("no")}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />
                            }
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem render={<Link href={`/taxas-condominio/${taxa.id}`} />}>
                              {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(taxa)}>
                              {tCommon("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(taxa)}
                            >
                              {tCommon("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("value")}</dt>
                        <dd>{formatUsd(taxa.valor_usd)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("dueDate")}</dt>
                        <dd>{t("dueDay", { day: taxa.dia_vencimento })}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("penalty")}</dt>
                        <dd>{taxa.pct_multa_atraso}%</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("dailyInterest")}</dt>
                        <dd>{taxa.pct_juros_diario}%</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">{t("gracePeriod")}</dt>
                        <dd>{t("graceDays", { count: taxa.dias_graca })}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>

              {/* sm+: tabela */}
              <Table className="hidden sm:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("titleColumn")}</TableHead>
                    <TableHead>{t("value")}</TableHead>
                    <TableHead>{t("dueDate")}</TableHead>
                    <TableHead>{t("penalty")}</TableHead>
                    <TableHead>{t("dailyInterest")}</TableHead>
                    <TableHead>{t("gracePeriod")}</TableHead>
                    <TableHead>{tCommon("active")}</TableHead>
                    <TableHead className="w-9" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxasList.map((taxa) => (
                    <TableRow key={taxa.id}>
                      <TableCell className="font-medium">
                        <Link href={`/taxas-condominio/${taxa.id}`} className="hover:underline">
                          {taxa.titulo}
                        </Link>
                      </TableCell>
                      <TableCell>{formatUsd(taxa.valor_usd)}</TableCell>
                      <TableCell>{t("dueDay", { day: taxa.dia_vencimento })}</TableCell>
                      <TableCell>{taxa.pct_multa_atraso}%</TableCell>
                      <TableCell>{taxa.pct_juros_diario}%</TableCell>
                      <TableCell>{t("graceDays", { count: taxa.dias_graca })}</TableCell>
                      <TableCell>
                        <Badge variant={taxa.ativo ? "default" : "outline"}>
                          {taxa.ativo ? tCommon("yes") : tCommon("no")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" aria-label={tCommon("actions")} />
                            }
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem render={<Link href={`/taxas-condominio/${taxa.id}`} />}>
                              {t("viewDetails")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(taxa)}>
                              {tCommon("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(taxa)}
                            >
                              {tCommon("delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
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
