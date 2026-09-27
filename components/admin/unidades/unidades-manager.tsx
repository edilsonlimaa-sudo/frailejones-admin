"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { Proprietario, Unidade } from "@/lib/types/unidades";
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
import { UnidadeFormDialog } from "@/components/admin/unidades/unidade-form-dialog";

type UnidadesManagerProps = {
  unidades: Unidade[];
  proprietarios: Proprietario[];
};

export function UnidadesManager({ unidades, proprietarios }: UnidadesManagerProps) {
  const t = useTranslations("unidades");
  const tCommon = useTranslations("common");
  const [unidadesList, setUnidadesList] = useState(unidades);
  const [proprietariosList, setProprietariosList] = useState(proprietarios);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUnidade, setEditingUnidade] = useState<Unidade | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Unidade | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreateDialog = () => {
    setEditingUnidade(null);
    setFormOpen(true);
  };

  const openEditDialog = (unidade: Unidade) => {
    setEditingUnidade(unidade);
    setFormOpen(true);
  };

  const handleSaved = (unidade: Unidade) => {
    setUnidadesList((prev) => {
      const exists = prev.some((u) => u.id === unidade.id);
      const next = exists
        ? prev.map((u) => (u.id === unidade.id ? unidade : u))
        : [...prev, unidade];
      return [...next].sort((a, b) => a.identificacao.localeCompare(b.identificacao));
    });
  };

  const handleProprietarioCreated = (proprietario: Proprietario) => {
    setProprietariosList((prev) =>
      [...prev, proprietario].sort((a, b) => a.nome.localeCompare(b.nome)),
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const supabase = createClient();
    setIsDeleting(true);

    try {
      const { error } = await supabase.from("unidades").delete().eq("id", deleteTarget.id);
      if (error) throw error;

      setUnidadesList((prev) => prev.filter((u) => u.id !== deleteTarget.id));
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
              {t("newUnit")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {unidadesList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("identification")}</TableHead>
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidadesList.map((unidade) => (
                  <TableRow key={unidade.id}>
                    <TableCell className="font-medium">
                      <Link href={`/unidades/${unidade.id}`} className="hover:underline">
                        {unidade.identificacao}
                      </Link>
                    </TableCell>
                    <TableCell>{unidade.proprietario?.nome ?? "—"}</TableCell>
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
                          <DropdownMenuItem render={<Link href={`/unidades/${unidade.id}`} />}>
                            {t("viewDetails")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(unidade)}>
                            {tCommon("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(unidade)}
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

      <UnidadeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        unidade={editingUnidade}
        proprietarios={proprietariosList}
        onSaved={handleSaved}
        onProprietarioCreated={handleProprietarioCreated}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { identificacao: deleteTarget?.identificacao ?? "" })}
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
