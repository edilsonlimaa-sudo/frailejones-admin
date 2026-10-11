"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type UnidadeSelecionavel = { id: string; identificacao: string; proprietario: { nome: string } | null };

type Filtro = "todas" | "selecionadas" | "naoSelecionadas";

type SeletorUnidadesProps = {
  unidades: UnidadeSelecionavel[];
  selecionados: Set<string>;
  onChange: (selecionados: Set<string>) => void;
  // prefixo dos ids dos checkboxes: dois seletores na mesma tela não podem colidir
  idPrefixo: string;
  // seleção já gravada: marca o que vai entrar/sair ao salvar. Sem ela (cadastro novo) não há marcas
  salvos?: Set<string>;
  // colunas da grade: a página tem largura pra 4, um dialog pra 2
  classNameGrade?: string;
  // classes da barra de busca/filtros (ex.: grudar no topo dentro de um dialog rolável)
  classNameBarra?: string;
};

// "21-01" → grupo "21-xx" (mesmo formato do código da unidade, sem nomear andar/torre). Só agrupa
// se todas as unidades seguirem o padrão e houver mais de um grupo; senão a lista fica plana
function agruparUnidades(unidades: UnidadeSelecionavel[]) {
  const prefixos = unidades.map((u) => (u.identificacao.includes("-") ? u.identificacao.split("-")[0] : null));
  if (prefixos.some((p) => p === null) || new Set(prefixos).size < 2) {
    return [{ chave: null, unidades }];
  }
  const grupos = new Map<string, UnidadeSelecionavel[]>();
  unidades.forEach((u, i) => {
    const chave = prefixos[i]!;
    grupos.set(chave, [...(grupos.get(chave) ?? []), u]);
  });
  return [...grupos.entries()].map(([chave, itens]) => ({ chave: chave as string | null, unidades: itens }));
}

export function SeletorUnidades({
  unidades,
  selecionados,
  onChange,
  idPrefixo,
  salvos,
  classNameGrade = "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
  classNameBarra,
}: SeletorUnidadesProps) {
  const t = useTranslations("seletorUnidades");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const termo = busca.trim().toLocaleLowerCase();
  const visiveis = unidades.filter((u) => {
    if (filtro === "selecionadas" && !selecionados.has(u.id)) return false;
    if (filtro === "naoSelecionadas" && selecionados.has(u.id)) return false;
    if (!termo) return true;
    return (
      u.identificacao.toLocaleLowerCase().includes(termo) ||
      (u.proprietario?.nome.toLocaleLowerCase().includes(termo) ?? false)
    );
  });
  const grupos = agruparUnidades(visiveis);
  const filtrando = termo !== "" || filtro !== "todas";

  const contagem: Record<Filtro, number> = {
    todas: unidades.length,
    selecionadas: selecionados.size,
    naoSelecionadas: unidades.length - selecionados.size,
  };

  const alternar = (ids: string[], checked: boolean) => {
    const proximo = new Set(selecionados);
    ids.forEach((id) => (checked ? proximo.add(id) : proximo.delete(id)));
    onChange(proximo);
  };

  const estadoDe = (itens: UnidadeSelecionavel[]) => {
    const marcadas = itens.filter((u) => selecionados.has(u.id)).length;
    return {
      marcadas,
      todas: itens.length > 0 && marcadas === itens.length,
      algumas: marcadas > 0 && marcadas < itens.length,
    };
  };
  const estadoVisiveis = estadoDe(visiveis);

  if (unidades.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noUnits")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex flex-col gap-3", classNameBarra)}>
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
            {(["todas", "selecionadas", "naoSelecionadas"] as const).map((f) => (
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
        {visiveis.length > 0 && (
          <label
            htmlFor={`${idPrefixo}-selecionar-todas`}
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground"
          >
            <Checkbox
              id={`${idPrefixo}-selecionar-todas`}
              checked={estadoVisiveis.todas}
              indeterminate={estadoVisiveis.algumas}
              onCheckedChange={(checked) => alternar(visiveis.map((u) => u.id), checked === true)}
            />
            {filtrando ? t("selectVisible", { count: visiveis.length }) : t("selectAll")}
          </label>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input py-8 text-center text-sm text-muted-foreground">
          {t("noResults")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((grupo) => {
            const estado = estadoDe(grupo.unidades);
            const idGrupo = `${idPrefixo}-grupo-${grupo.chave}`;
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
                    <span className="font-medium tabular-nums">{t("group", { prefix: grupo.chave })}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {estado.marcadas}/{grupo.unidades.length}
                    </span>
                  </label>
                )}
                <div className={cn("grid grid-cols-1 gap-2", classNameGrade)}>
                  {grupo.unidades.map((unidade) => {
                    const marcada = selecionados.has(unidade.id);
                    const mudou = salvos !== undefined && marcada !== salvos.has(unidade.id);
                    const nomeProprietario = unidade.proprietario?.nome ?? t("noOwner");
                    return (
                      <label
                        key={unidade.id}
                        htmlFor={`${idPrefixo}-${unidade.id}`}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                          marcada ? "border-primary/30 bg-primary/5" : "border-input text-muted-foreground",
                          mudou && (marcada ? "border-primary" : "border-dashed border-destructive/60"),
                        )}
                      >
                        <Checkbox
                          id={`${idPrefixo}-${unidade.id}`}
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
      )}
    </div>
  );
}
