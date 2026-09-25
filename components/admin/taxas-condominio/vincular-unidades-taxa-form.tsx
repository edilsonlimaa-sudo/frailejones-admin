"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type VincularUnidadesTaxaFormProps = {
  taxaId: string;
  todasUnidades: { id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[];
  unidadesVinculadasIds: string[];
};

export function VincularUnidadesTaxaForm({
  taxaId,
  todasUnidades,
  unidadesVinculadasIds,
}: VincularUnidadesTaxaFormProps) {
  const router = useRouter();
  const [unidadeIds, setUnidadeIds] = useState<string[]>(unidadesVinculadasIds);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const houveAlteracao =
    unidadeIds.length !== unidadesVinculadasIds.length ||
    unidadeIds.some((id) => !unidadesVinculadasIds.includes(id));

  const handleToggleUnidade = (unidadeId: string, checked: boolean) => {
    setUnidadeIds((prev) =>
      checked ? [...prev, unidadeId] : prev.filter((id) => id !== unidadeId),
    );
  };

  const todasSelecionadas = todasUnidades.length > 0 && unidadeIds.length === todasUnidades.length;
  const algumasSelecionadas = unidadeIds.length > 0 && !todasSelecionadas;

  const handleToggleTodas = (checked: boolean) => {
    setUnidadeIds(checked ? todasUnidades.map((unidade) => unidade.id) : []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsSubmitting(true);

    try {
      // sincroniza o vínculo: remove o anterior desta taxa e recria com a seleção atual
      const { error: deleteError } = await supabase
        .from("taxa_condominio_unidades")
        .delete()
        .eq("taxa_condominio_id", taxaId);
      if (deleteError) throw deleteError;

      if (unidadeIds.length > 0) {
        const { error: insertError } = await supabase
          .from("taxa_condominio_unidades")
          .insert(unidadeIds.map((unidadeId) => ({ taxa_condominio_id: taxaId, unidade_id: unidadeId })));
        if (insertError) throw insertError;
      }

      toast.success("Unidades vinculadas atualizadas.");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar unidades vinculadas.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {todasUnidades.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
      ) : (
        <>
          <label htmlFor="taxa-unidade-selecionar-todas" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              id="taxa-unidade-selecionar-todas"
              checked={todasSelecionadas}
              indeterminate={algumasSelecionadas}
              onCheckedChange={(checked) => handleToggleTodas(checked === true)}
            />
            Selecionar todas
          </label>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-input">
            {todasUnidades.map((unidade) => (
              <label
                key={unidade.id}
                htmlFor={`taxa-unidade-${unidade.id}`}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <Checkbox
                  id={`taxa-unidade-${unidade.id}`}
                  checked={unidadeIds.includes(unidade.id)}
                  onCheckedChange={(checked) => handleToggleUnidade(unidade.id, checked === true)}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{unidade.identificacao}</span>
                  <span className="text-xs text-muted-foreground">
                    {unidade.proprietario?.nome ?? "Sem proprietário"}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </>
      )}

      <Button type="submit" disabled={isSubmitting || !houveAlteracao} className="self-start">
        {isSubmitting ? "Salvando..." : "Salvar vínculos"}
      </Button>
    </form>
  );
}
