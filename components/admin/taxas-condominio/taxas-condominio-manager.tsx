"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import { INTL_LOCALE } from "@/lib/intl-locale";
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

type TaxasCondominioManagerProps = {
  taxas: TaxaCondominio[];
};

export function TaxasCondominioManager({ taxas }: TaxasCondominioManagerProps) {
  const t = useTranslations("taxasCondominio");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const currencyFormatter = new Intl.NumberFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    style: "currency",
    currency: "USD",
  });
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
            <Table>
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
                    <TableCell>{currencyFormatter.format(taxa.valor_usd)}</TableCell>
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
