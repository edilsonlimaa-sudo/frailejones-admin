"use client";

import { useState } from "react";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

type TaxasCondominioManagerProps = {
  taxas: TaxaCondominio[];
};

export function TaxasCondominioManager({ taxas }: TaxasCondominioManagerProps) {
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
      toast.success("Taxa de condomínio excluída.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir taxa de condomínio.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Taxas de Condomínio</CardTitle>
          <CardDescription>
            Regras de valor, vencimento, multa e juros usadas na emissão das cobranças ordinárias.
          </CardDescription>
          <CardAction>
            <Button onClick={openCreateDialog}>
              <PlusIcon />
              Nova taxa
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {taxasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma taxa de condomínio cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Multa</TableHead>
                  <TableHead>Juros/dia</TableHead>
                  <TableHead>Carência</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxasList.map((taxa) => (
                  <TableRow key={taxa.id}>
                    <TableCell className="font-medium">{taxa.titulo}</TableCell>
                    <TableCell>{currencyFormatter.format(taxa.valor_usd)}</TableCell>
                    <TableCell>Dia {taxa.dia_vencimento}</TableCell>
                    <TableCell>{taxa.pct_multa_atraso}%</TableCell>
                    <TableCell>{taxa.pct_juros_diario}%</TableCell>
                    <TableCell>{taxa.dias_graca} dia(s)</TableCell>
                    <TableCell>
                      <Badge variant={taxa.ativo ? "default" : "outline"}>
                        {taxa.ativo ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="Ações" />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(taxa)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(taxa)}
                          >
                            Excluir
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
            <AlertDialogTitle>Excluir taxa de condomínio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a taxa &quot;{deleteTarget?.titulo}&quot;? Essa ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
