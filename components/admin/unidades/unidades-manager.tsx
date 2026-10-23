"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDownIcon, Building2, MoreHorizontalIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { ResumoPendencias, SituacaoConta } from "@/lib/estado-de-cuenta";
import { INTL_LOCALE } from "@/lib/intl-locale";
import {
  contarSituacoes,
  FILTRO_SITUACAO_PADRAO,
  ORDEM_UNIDADES_PADRAO,
  type FiltroSituacao,
  type OrdemUnidades,
} from "@/lib/listagem-unidades";
import { formatUsd } from "@/lib/moeda";
import type { Proprietario, Unidade } from "@/lib/types/unidades";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { BarraListagem } from "@/components/admin/barra-listagem";
import { classesDoChip } from "@/components/admin/chip";
import { UnidadeFormDialog } from "@/components/admin/unidades/unidade-form-dialog";

type UnidadesManagerProps = {
  unidades: Unidade[];
  proprietarios: Proprietario[];
  // situação de conta de cada unidade (mesma regra do estado de conta), calculada no servidor
  situacoes: Record<string, ResumoPendencias>;
  // quantas cobranças cada unidade tem: com histórico, a unidade não pode ser excluída
  cobrancasPorUnidade: Record<string, number>;
  filtroInicial: FiltroSituacao;
  ordemInicial: OrdemUnidades;
  proprietarioInicial: string | null;
};

// unidade recém-cadastrada nesta tela ainda não tem situação calculada: sem cobranças, está em dia
const SEM_PENDENCIAS: ResumoPendencias = {
  situacao: "alDia",
  atrasoDesde: null,
  divida: { principal: 0, encargos: 0, total: 0 },
  vencidas: 0,
  maiorAtraso: 0,
};

const corDaSituacao: Record<SituacaoConta, string> = {
  alDia: "bg-primary",
  porVencer: "bg-muted-foreground/50",
  enAtraso: "bg-destructive",
};

// colunas da grade (desktop): unidade | proprietário | situação | dívida | ações
export function UnidadesManager({
  unidades,
  proprietarios,
  situacoes,
  cobrancasPorUnidade,
  filtroInicial,
  ordemInicial,
  proprietarioInicial,
}: UnidadesManagerProps) {
  const t = useTranslations("unidades");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const [unidadesList, setUnidadesList] = useState(unidades);
  const [proprietariosList, setProprietariosList] = useState(proprietarios);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtro, setFiltro] = useState(filtroInicial);
  const [ordem, setOrdem] = useState(ordemInicial);
  const [proprietarioId, setProprietarioId] = useState(proprietarioInicial);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUnidade, setEditingUnidade] = useState<Unidade | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Unidade | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // filtro, ordem e proprietário na URL (recarregar ou compartilhar o link mantém a visão)
  const atualizarUrl = (parametro: string, valor: string | null, padrao: string | null) => {
    const url = new URL(window.location.href);
    if (valor === null || valor === padrao) url.searchParams.delete(parametro);
    else url.searchParams.set(parametro, valor);
    window.history.replaceState(null, "", url);
  };
  const trocarFiltro = (novo: FiltroSituacao) => {
    setFiltro(novo);
    atualizarUrl("situacion", novo, FILTRO_SITUACAO_PADRAO);
  };
  const trocarOrdem = (nova: OrdemUnidades) => {
    setOrdem(nova);
    atualizarUrl("orden", nova, ORDEM_UNIDADES_PADRAO);
  };
  const trocarProprietario = (id: string | null) => {
    setProprietarioId(id);
    atualizarUrl("propietario", id, null);
  };

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

  const situacaoDe = (unidade: Unidade) => situacoes[unidade.id] ?? SEM_PENDENCIAS;
  const contagem = contarSituacoes(unidadesList.map(situacaoDe));
  const unidadesPorProprietario = new Map<string, number>();
  for (const u of unidadesList) {
    unidadesPorProprietario.set(u.proprietario_id, (unidadesPorProprietario.get(u.proprietario_id) ?? 0) + 1);
  }
  const proprietarioFiltrado = proprietarioId
    ? (unidadesList.find((u) => u.proprietario_id === proprietarioId)?.proprietario?.nome ?? null)
    : null;

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visiveis = unidadesList
    .filter(
      (unidade) =>
        !normalizedSearch ||
        unidade.identificacao.toLocaleLowerCase().includes(normalizedSearch) ||
        (unidade.proprietario?.nome.toLocaleLowerCase().includes(normalizedSearch) ?? false),
    )
    .filter((unidade) => filtro === "todas" || situacaoDe(unidade).situacao === filtro)
    .filter((unidade) => !proprietarioId || unidade.proprietario_id === proprietarioId)
    .sort((a, b) => {
      const sa = situacaoDe(a);
      const sb = situacaoDe(b);
      const desempate = a.identificacao.localeCompare(b.identificacao);
      if (ordem === "deuda") return sb.divida.total - sa.divida.total || desempate;
      if (ordem === "atraso") return sb.maiorAtraso - sa.maiorAtraso || sb.divida.total - sa.divida.total || desempate;
      return desempate;
    });

  return (
    <div className="flex flex-col gap-4">
      {/* "header duplo": título, busca e filtros ficam presos abaixo do header enquanto a lista rola */}
      <BarraListagem
        icone={Building2}
        titulo={t("title")}
        acao={
          <Button onClick={openCreateDialog}>
            <PlusIcon />
            {t("newUnit")}
          </Button>
        }
      >

        <div className="flex items-center gap-2 pb-3">
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t("searchPlaceholder")}
            className="h-10 bg-card"
          />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon" variant="outline" aria-label={t("sortLabel")} />}>
              <ArrowUpDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={ordem} onValueChange={(valor) => trocarOrdem(valor as OrdemUnidades)}>
                <DropdownMenuLabel>{t("sortLabel")}</DropdownMenuLabel>
                <DropdownMenuRadioItem value="unidad">{t("identification")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="atraso">{t("columns.situation")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="deuda">{t("columns.debt")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* resumo que também filtra: tocar numa situação mostra só as unidades nela. Na mesma fila,
            que rola de lado no celular, a dívida total das unidades listadas */}
        <div
          role="group"
          aria-label={t("summary.label")}
          className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(["todas", "alDia", "porVencer", "enAtraso"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => trocarFiltro(f)}
              className={classesDoChip(filtro === f)}
            >
              {/* no chip ativo (verde) a bolinha ganha um contorno claro pra não sumir */}
              {f !== "todas" && (
                <span className={cn("size-2 rounded-full", corDaSituacao[f], filtro === f && "ring-1 ring-primary-foreground/70")} />
              )}
              {t(`summary.${f}`, { count: f === "todas" ? contagem.total : contagem[f] })}
            </button>
          ))}
          <p className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap">
            <span className="text-muted-foreground">{t("summary.totalDebt")} </span>
            <span className={cn("font-medium tabular-nums", contagem.divida > 0 && "text-destructive")}>
              {formatUsd(contagem.divida)}
            </span>
          </p>
        </div>
      </BarraListagem>

      {proprietarioFiltrado && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("ownerFilter")}</span>
          <Badge variant="secondary">{proprietarioFiltrado}</Badge>
          <Button size="xs" variant="ghost" onClick={() => trocarProprietario(null)}>
            <XIcon />
            {t("clearOwnerFilter")}
          </Button>
        </div>
      )}

      {unidadesList.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
      ) : visiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSearchResults")}</p>
      ) : (
        // um card por unidade: identificação e dono em cima, situação e dívida embaixo
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((unidade) => {
            const s = situacaoDe(unidade);
            const outrasDoDono = unidadesPorProprietario.get(unidade.proprietario_id) ?? 0;
            const temHistorico = (cobrancasPorUnidade[unidade.id] ?? 0) > 0;
            return (
              <li key={unidade.id}>
                {/* o card todo leva ao detalhe; botões internos param a propagação do clique */}
                <Card
                  size="sm"
                  onClick={() => router.push(`/unidades/${unidade.id}`)}
                  className="relative h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
                >
                  <CardContent className="flex h-full flex-col gap-4">
                    {/* o menu ⋯ fica no canto (absolute): reserva espaço à direita */}
                    <div className="min-w-0 pr-8">
                      <Link
                        href={`/unidades/${unidade.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-lg leading-tight font-semibold tracking-tight hover:underline"
                      >
                        {unidade.identificacao}
                      </Link>
                      <div className="mt-0.5 flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm text-muted-foreground">{unidade.proprietario?.nome ?? "—"}</span>
                        {outrasDoDono > 1 && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="shrink-0"
                            aria-label={t("ownerUnitsAria", { count: outrasDoDono })}
                            onClick={(e) => {
                              e.stopPropagation();
                              trocarProprietario(unidade.proprietario_id);
                            }}
                          >
                            {t("ownerUnits", { count: outrasDoDono })}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm">
                          <span className={cn("size-2 shrink-0 rounded-full", corDaSituacao[s.situacao])} />
                          {t(`situation.${s.situacao}`)}
                        </p>
                        {s.atrasoDesde && (
                          <p className="text-xs text-muted-foreground">
                            {t("situationSince", { date: formatDate(s.atrasoDesde) })}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-lg leading-tight font-semibold tabular-nums",
                            s.situacao === "enAtraso" ? "text-destructive" : s.divida.total === 0 && "text-muted-foreground",
                          )}
                        >
                          {s.divida.total > 0 ? formatUsd(s.divida.total) : "—"}
                        </p>
                        {s.vencidas > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {t("overdueSummary", { count: s.vencidas, days: s.maiorAtraso })}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>

                  <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
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
                        {temHistorico ? (
                          // visível mas desabilitado, com o motivo: o banco não deixa excluir
                          // unidade com cobranças/pagamentos (o histórico financeiro se perderia)
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
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(unidade)}>
                            {tCommon("delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

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
    </div>
  );
}
