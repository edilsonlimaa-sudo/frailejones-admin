"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { SeletorUnidades, type UnidadeSelecionavel } from "@/components/admin/unidades/seletor-unidades";

type VincularUnidadesTaxaFormProps = {
  taxaId: string;
  todasUnidades: UnidadeSelecionavel[];
  unidadesVinculadasIds: string[];
};

// ids viajam na query string do delete: em lotes pra não estourar o tamanho da URL
const TAMANHO_LOTE = 100;

function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) lotes.push(itens.slice(i, i + TAMANHO_LOTE));
  return lotes;
}

export function VincularUnidadesTaxaForm({
  taxaId,
  todasUnidades,
  unidadesVinculadasIds,
}: VincularUnidadesTaxaFormProps) {
  const router = useRouter();
  const t = useTranslations("vincularUnidadesTaxa");
  const salvos = useMemo(() => new Set(unidadesVinculadasIds), [unidadesVinculadasIds]);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(unidadesVinculadasIds));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adicionadas = [...selecionados].filter((id) => !salvos.has(id));
  const removidas = [...salvos].filter((id) => !selecionados.has(id));
  const houveAlteracao = adicionadas.length > 0 || removidas.length > 0;

  // fechar/recarregar a aba com seleção pendente perde o trabalho: o navegador pede confirmação
  useEffect(() => {
    if (!houveAlteracao) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [houveAlteracao]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();
    setIsSubmitting(true);

    try {
      // aplica só a diferença: um erro no meio não apaga os vínculos que não mudaram
      for (const lote of emLotes(removidas)) {
        const { error } = await supabase
          .from("taxa_condominio_unidades")
          .delete()
          .eq("taxa_condominio_id", taxaId)
          .in("unidade_id", lote);
        if (error) throw error;
      }
      for (const lote of emLotes(adicionadas)) {
        const { error } = await supabase
          .from("taxa_condominio_unidades")
          .upsert(
            lote.map((unidadeId) => ({ taxa_condominio_id: taxaId, unidade_id: unidadeId })),
            { onConflict: "taxa_condominio_id,unidade_id", ignoreDuplicates: true },
          );
        if (error) throw error;
      }

      toast.success(t("successMessage"));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("errorMessage"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <SeletorUnidades
        unidades={todasUnidades}
        selecionados={selecionados}
        onChange={setSelecionados}
        salvos={salvos}
        idPrefixo="taxa-unidade"
      />

      {/* ação sempre à vista enquanto houver mudança: a lista pode ser bem maior que a tela */}
      {houveAlteracao && (
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border bg-popover p-3 shadow-lg sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-sm font-medium">
              {[
                adicionadas.length > 0 && t("pendingAdded", { count: adicionadas.length }),
                removidas.length > 0 && t("pendingRemoved", { count: removidas.length }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-muted-foreground">{t("pendingHint")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => setSelecionados(new Set(unidadesVinculadasIds))}
            >
              {t("discard")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("saveLinks")}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
