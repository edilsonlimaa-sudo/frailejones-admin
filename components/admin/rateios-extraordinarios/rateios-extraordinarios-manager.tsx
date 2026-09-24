"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
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
import { RateioExtraordinarioFormDialog } from "@/components/admin/rateios-extraordinarios/rateio-extraordinario-form-dialog";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

type RateiosExtraordinariosManagerProps = {
  despesas: DespesaExtraordinaria[];
  unidades: Unidade[];
};

export function RateiosExtraordinariosManager({
  despesas,
  unidades,
}: RateiosExtraordinariosManagerProps) {
  const [despesasList, setDespesasList] = useState(despesas);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaExtraordinaria | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<DespesaExtraordinaria | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortDespesas = (list: DespesaExtraordinaria[]) =>
    [...list].sort((a, b) => b.data_vencimento.localeCompare(a.data_vencimento));

  const openCreateDialog = () => {
    setEditingDespesa(null);
    setFormOpen(true);
  };

  const openEditDialog = (despesa: DespesaExtraordinaria) => {
    setEditingDespesa(despesa);
    setFormOpen(true);
  };

  const handleSaved = (despesa: DespesaExtraordinaria) => {
    setDespesasList((prev) => {
      const exists = prev.some((d) => d.id === despesa.id);
      const next = exists ? prev.map((d) => (d.id === despesa.id ? despesa : d)) : [...prev, despesa];
      return sortDespesas(next);
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const supabase = createClient();
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("despesas_extraordinarias")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;

      setDespesasList((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success("Rateio extraordinário excluído.");
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir rateio extraordinário.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Rateios Extraordinários</CardTitle>
          <CardDescription>
            Despesas extraordinárias (ex: reparos) rateadas entre as unidades participantes e
            cobradas via cobranças extraordinárias.
          </CardDescription>
          <CardAction>
            <Button onClick={openCreateDialog}>
              <PlusIcon />
              Novo rateio
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {despesasList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum rateio extraordinário cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Valor total</TableHead>
                  <TableHead>Valor/unidade</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Multa</TableHead>
                  <TableHead>Juros/dia</TableHead>
                  <TableHead>Carência</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {despesasList.map((despesa) => (
                  <TableRow key={despesa.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/rateios-extraordinarios/${despesa.id}`}
                        className="hover:underline"
                      >
                        {despesa.titulo}
                      </Link>
                    </TableCell>
                    <TableCell>{currencyFormatter.format(despesa.valor_total_usd)}</TableCell>
                    <TableCell>{currencyFormatter.format(despesa.valor_por_unidade_usd)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{despesa.unidade_ids.length}</Badge>
                    </TableCell>
                    <TableCell>
                      {dateFormatter.format(new Date(`${despesa.data_vencimento}T00:00:00Z`))}
                    </TableCell>
                    <TableCell>{despesa.pct_multa_atraso}%</TableCell>
                    <TableCell>{despesa.pct_juros_diario}%</TableCell>
                    <TableCell>{despesa.dias_graca} dia(s)</TableCell>
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
                          <DropdownMenuItem render={<Link href={`/rateios-extraordinarios/${despesa.id}`} />}>
                            Ver progresso
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(despesa)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(despesa)}
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

      <RateioExtraordinarioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        despesa={editingDespesa}
        unidades={unidades}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rateio extraordinário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o rateio &quot;{deleteTarget?.titulo}&quot;? Essa ação
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
