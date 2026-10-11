"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Unidade = { id: string; identificacao: string; proprietario: { id: string; nome: string } | null };

type VincularUnidadesTaxaFormProps = {
  taxaId: string;
  todasUnidades: Unidade[];
  unidadesVinculadasIds: string[];
};

type Filtro = "todas" | "vinculadas" | "noVinculadas";

// ids viajam na query string do delete: em lotes pra não estourar o tamanho da URL
const TAMANHO_LOTE = 100;

function emLotes<T>(itens: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) lotes.push(itens.slice(i, i + TAMANHO_LOTE));
  return lotes;
}

// "21-01" → grupo "21" (andar/torre). Só agrupa se todas as unidades seguirem o padrão e houver
// mais de um grupo; senão a lista fica plana
function agruparUnidades(unidades: Unidade[]): { chave: string | null; unidades: Unidade[] }[] {
  const prefixo = (u: Unidade) => (u.identificacao.includes("-") ? u.identificacao.split("-")[0] : null);
  const prefixos = unidades.map(prefixo);
  if (prefixos.some((p) => p === null) || new Set(prefixos).size < 2) {
    return [{ chave: null, unidades }];
  }
  const grupos = new Map<string, Unidade[]>();
  unidades.forEach((u, i) => {
    const chave = prefixos[i]!;
    grupos.set(chave, [...(grupos.get(chave) ?? []), u]);
  });
  return [...grupos.entries()].map(([chave, itens]) => ({ chave, unidades: itens }));
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
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
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

  const termo = busca.trim().toLocaleLowerCase();
  const visiveis = todasUnidades.filter((u) => {
    if (filtro === "vinculadas" && !selecionados.has(u.id)) return false;
    if (filtro === "noVinculadas" && selecionados.has(u.id)) return false;
    if (!termo) return true;
    return (
      u.identificacao.toLocaleLowerCase().includes(termo) ||
      (u.proprietario?.nome.toLocaleLowerCase().includes(termo) ?? false)
    );
  });
  const grupos = agruparUnidades(visiveis);
  const filtrando = termo !== "" || filtro !== "todas";

  const contagem: Record<Filtro, number> = {
    todas: todasUnidades.length,
    vinculadas: selecionados.size,
    noVinculadas: todasUnidades.length - selecionados.size,
  };

  const alternar = (ids: string[], checked: boolean) => {
    setSelecionados((prev) => {
      const proximo = new Set(prev);
      ids.forEach((id) => (checked ? proximo.add(id) : proximo.delete(id)));
      return proximo;
    });
  };

  const estadoDe = (unidades: Unidade[]) => {
    const marcadas = unidades.filter((u) => selecionados.has(u.id)).length;
    return {
      marcadas,
      todas: unidades.length > 0 && marcadas === unidades.length,
      algumas: marcadas > 0 && marcadas < unidades.length,
    };
  };
  const estadoVisiveis = estadoDe(visiveis);

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

  if (todasUnidades.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noUnits")}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="sm:max-w-xs"
        />
        <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-2">
          {(["todas", "vinculadas", "noVinculadas"] as const).map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filtro === f ? "secondary" : "ghost"}
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
            >
              {t(`filter.${f}`, { count: contagem[f] })}
            </Button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input py-8 text-center text-sm text-muted-foreground">
          {t("noResults")}
        </p>
      ) : (
        <>
          <label
            htmlFor="taxa-unidade-selecionar-todas"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground"
          >
            <Checkbox
              id="taxa-unidade-selecionar-todas"
              checked={estadoVisiveis.todas}
              indeterminate={estadoVisiveis.algumas}
              onCheckedChange={(checked) => alternar(visiveis.map((u) => u.id), checked === true)}
            />
            {filtrando ? t("selectVisible", { count: visiveis.length }) : t("selectAll")}
          </label>

          <div className="flex flex-col gap-5">
            {grupos.map((grupo) => {
              const estado = estadoDe(grupo.unidades);
              const idGrupo = `taxa-unidade-grupo-${grupo.chave}`;
              return (
                <section key={grupo.chave ?? "todas"} className="flex flex-col gap-2">
                  {grupo.chave !== null && (
                    <label htmlFor={idGrupo} className="flex w-fit items-center gap-2 text-sm">
                      <Checkbox
                        id={idGrupo}
                        checked={estado.todas}
                        indeterminate={estado.algumas}
                        onCheckedChange={(checked) => alternar(grupo.unidades.map((u) => u.id), checked === true)}
                      />
                      <span className="font-medium">{t("group", { prefix: grupo.chave })}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {estado.marcadas}/{grupo.unidades.length}
                      </span>
                    </label>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {grupo.unidades.map((unidade) => {
                      const marcada = selecionados.has(unidade.id);
                      const mudou = marcada !== salvos.has(unidade.id);
                      const nomeProprietario = unidade.proprietario?.nome ?? t("noOwner");
                      return (
                        <label
                          key={unidade.id}
                          htmlFor={`taxa-unidade-${unidade.id}`}
                          className={cn(
                            "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                            marcada ? "border-primary/30 bg-primary/5" : "border-input text-muted-foreground",
                            mudou && (marcada ? "border-primary" : "border-dashed border-destructive/60"),
                          )}
                        >
                          <Checkbox
                            id={`taxa-unidade-${unidade.id}`}
                            checked={marcada}
                            onCheckedChange={(checked) => alternar([unidade.id], checked === true)}
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className={cn("font-medium tabular-nums", marcada && "text-foreground")}>
                              {unidade.identificacao}
                            </span>
                            <span className="truncate text-xs text-muted-foreground" title={nomeProprietario}>
                              {nomeProprietario}
                            </span>
                          </div>
                          {mudou && (
                            <Badge variant={marcada ? "default" : "destructive"} className="shrink-0">
                              {marcada ? t("willAdd") : t("willRemove")}
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

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
