"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, InboxIcon, SearchIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo, Liquidacao } from "@/lib/types/pagamentos";
import {
  abonoDaLiquidacao,
  agruparPorDia,
  FILTROS_ABONO,
  passaNosFiltros,
  totaisPorMoeda,
  type FiltroAbono,
  type FiltrosLiquidacoes,
} from "@/lib/listagem-liquidacoes";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { FUSO_CARACAS } from "@/lib/fuso";
import type { AnoMes } from "@/lib/mes";
import { formatMoeda, formatUsd } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CabecalhoMes } from "@/components/admin/painel/cabecalho-mes";

type LiquidacoesManagerProps = AnoMes & {
  liquidacoes: Liquidacao[];
  // mês de caixa listado, "YYYY-MM"
  mesCaixa: string;
  filtrosIniciais: FiltrosLiquidacoes;
  // mês corrente em Caracas, pro cabeçalho saber se está nele
  hoje: AnoMes;
};

const MOEDAS: MoedaTipo[] = ["USD", "VES"];

// atrasada em vermelho: é a dívida recuperada, o que mais interessa ao conferir o mês
const corDoAbono: Record<FiltroAbono, string> = {
  doMes: "bg-primary",
  atrasado: "bg-destructive",
  adiantado: "bg-primary/50",
  encargos: "bg-chart-3",
};

// colunas da lista (desktop): hora | unidade | cobrança | forma e referência | valor
const COLUNAS = "sm:grid sm:grid-cols-[3.25rem_5.5rem_minmax(0,1fr)_minmax(0,10rem)_minmax(0,11rem)] sm:items-center sm:gap-4";

export function LiquidacoesManager({
  liquidacoes,
  ano,
  mes,
  mesCaixa,
  filtrosIniciais,
  hoje,
}: LiquidacoesManagerProps) {
  const t = useTranslations("liquidacoes");
  const tForma = useTranslations("liquidacoes.paymentMethod");
  const router = useRouter();
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];

  const [filtros, setFiltros] = useState(filtrosIniciais);
  const [busca, setBusca] = useState("");

  const formatos = useMemo(
    () => ({
      hora: new Intl.DateTimeFormat(intlLocale, { timeStyle: "short", timeZone: FUSO_CARACAS }),
      dia: new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
      mes: new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }),
      mesCurto: new Intl.DateTimeFormat(intlLocale, { month: "short", year: "2-digit", timeZone: "UTC" }),
    }),
    [intlLocale],
  );
  const mesLabel = formatos.mes.format(new Date(Date.UTC(ano, mes - 1, 1)));
  const formatDia = (dia: string) => {
    const label = formatos.dia.format(new Date(`${dia}T00:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  // filtros na URL: recarregar, voltar do detalhe ou compartilhar o link mantém o recorte
  const aplicarFiltros = (novos: FiltrosLiquidacoes) => {
    setFiltros(novos);
    const url = new URL(window.location.href);
    const params: [string, string | null][] = [
      ["moneda", novos.moeda],
      ["forma", novos.forma],
      ["abono", novos.abono],
    ];
    for (const [nome, valor] of params) {
      if (valor) url.searchParams.set(nome, valor);
      else url.searchParams.delete(nome);
    }
    window.history.replaceState(null, "", url);
  };
  // clicar de novo no filtro ativo desliga
  const alternarCanal = (moeda: MoedaTipo, forma: FormaPagamentoTipo | null) => {
    const ativo = filtros.moeda === moeda && filtros.forma === forma;
    aplicarFiltros({ ...filtros, moeda: ativo ? null : moeda, forma: ativo ? null : forma });
  };
  const alternarAbono = (abono: FiltroAbono) =>
    aplicarFiltros({ ...filtros, abono: filtros.abono === abono ? null : abono });
  const limparFiltros = () => {
    aplicarFiltros({ moeda: null, forma: null, abono: null });
    setBusca("");
  };

  // resumo do mês inteiro (não muda com os filtros): os mesmos números do cartão do Painel
  const resumo = useMemo(() => {
    const porMoeda = Object.fromEntries(
      MOEDAS.map((moeda) => {
        const daMoeda = liquidacoes.filter((l) => l.moeda === moeda);
        const canais = new Map<FormaPagamentoTipo, { quantidade: number; valor: number }>();
        for (const l of daMoeda) {
          const canal = canais.get(l.forma_pagamento) ?? { quantidade: 0, valor: 0 };
          canal.quantidade += 1;
          canal.valor += l.valor_recebido;
          canais.set(l.forma_pagamento, canal);
        }
        return [
          moeda,
          {
            quantidade: daMoeda.length,
            total: daMoeda.reduce((acc, l) => acc + l.valor_recebido, 0),
            canais: [...canais.entries()]
              .map(([forma, c]) => ({ forma, ...c }))
              .sort((a, b) => b.valor - a.valor),
          },
        ];
      }),
    ) as Record<MoedaTipo, { quantidade: number; total: number; canais: { forma: FormaPagamentoTipo; quantidade: number; valor: number }[] }>;

    const abono: Record<FiltroAbono, number> = { doMes: 0, atrasado: 0, adiantado: 0, encargos: 0 };
    for (const l of liquidacoes) {
      abono.encargos += l.encargos_pagos_usd;
      const tipo = abonoDaLiquidacao(l, mesCaixa);
      if (tipo) abono[tipo] += l.principal_abatido_usd;
    }
    const totalAbatido = abono.doMes + abono.atrasado + abono.adiantado + abono.encargos;
    return { porMoeda, abono, totalAbatido };
  }, [liquidacoes, mesCaixa]);

  const termo = busca.trim().toLowerCase();
  const visiveis = liquidacoes.filter(
    (l) =>
      passaNosFiltros(l, filtros, mesCaixa) &&
      (!termo ||
        [l.unidade?.identificacao, l.referencia_bancaria, l.cobranca?.descricao, l.observacao].some((campo) =>
          campo?.toLowerCase().includes(termo),
        )),
  );
  const totaisVisiveis = totaisPorMoeda(visiveis);
  const dias = agruparPorDia(visiveis);
  const temFiltro = Boolean(filtros.moeda || filtros.forma || filtros.abono || termo);

  const nomeMoeda = (moeda: MoedaTipo) => t(`currency.${moeda}`);
  const chipsFiltro: { chave: string; rotulo: string; remover: () => void }[] = [];
  if (filtros.moeda) {
    chipsFiltro.push({
      chave: "canal",
      rotulo: filtros.forma
        ? t("filters.channel", { method: tForma(filtros.forma), currency: nomeMoeda(filtros.moeda) })
        : t("filters.currency", { currency: nomeMoeda(filtros.moeda) }),
      remover: () => aplicarFiltros({ ...filtros, moeda: null, forma: null }),
    });
  } else if (filtros.forma) {
    chipsFiltro.push({
      chave: "canal",
      rotulo: tForma(filtros.forma),
      remover: () => aplicarFiltros({ ...filtros, forma: null }),
    });
  }
  if (filtros.abono) {
    chipsFiltro.push({
      chave: "abono",
      rotulo: t(`settled.rows.${filtros.abono}`),
      remover: () => aplicarFiltros({ ...filtros, abono: null }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* o mês de caixa é o título, como no Dashboard: barra fixa com setas e grade de meses */}
      <CabecalhoMes titulo={t("title")} ano={ano} mes={mes} hoje={hoje} basePath="/liquidacoes" />

      {/* resumo do caixa: o mesmo recorte do cartão de entradas do Painel, e cada linha filtra a lista */}
      <section aria-label={t("summaryLabel")} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {MOEDAS.map((moeda) => {
          const r = resumo.porMoeda[moeda];
          const moedaAtiva = filtros.moeda === moeda && !filtros.forma;
          return (
            <Card key={moeda} size="sm">
              <CardHeader>
                <CardDescription>{t(`cash.received.${moeda}`)}</CardDescription>
                <CardTitle className="text-2xl tracking-tight tabular-nums">{formatMoeda(r.total, moeda)}</CardTitle>
                <button
                  type="button"
                  disabled={r.quantidade === 0}
                  aria-pressed={moedaAtiva}
                  onClick={() => alternarCanal(moeda, null)}
                  className={cn(
                    "w-fit text-left text-xs text-muted-foreground underline-offset-2 enabled:hover:text-foreground enabled:hover:underline",
                    moedaAtiva && "font-medium text-foreground underline",
                  )}
                >
                  {t("cash.payments", { count: r.quantidade })}
                </button>
              </CardHeader>
              <CardContent>
                {r.canais.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("cash.noEntries")}</p>
                ) : (
                  <ul className="-mx-2 flex flex-col">
                    {r.canais.map((canal) => {
                      const ativo = filtros.moeda === moeda && filtros.forma === canal.forma;
                      return (
                        <li key={canal.forma}>
                          <button
                            type="button"
                            aria-pressed={ativo}
                            onClick={() => alternarCanal(moeda, canal.forma)}
                            className={cn(
                              "flex w-full flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60",
                              ativo && "bg-muted ring-1 ring-ring/40",
                            )}
                          >
                            <span className="flex w-full items-baseline justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">
                                {tForma(canal.forma)}
                                <span className="text-xs text-muted-foreground"> · {canal.quantidade}</span>
                              </span>
                              <span className="shrink-0 font-medium tabular-nums">{formatMoeda(canal.valor, moeda)}</span>
                            </span>
                            <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full bg-primary"
                                style={{ width: `${r.total > 0 ? (canal.valor / r.total) * 100 : 0}%` }}
                              />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card size="sm">
          <CardHeader>
            <CardDescription>{t("settled.title")}</CardDescription>
            <CardTitle className="text-2xl tracking-tight tabular-nums">{formatUsd(resumo.totalAbatido)}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("settled.hint")}</p>
          </CardHeader>
          <CardContent>
            <ul className="-mx-2 flex flex-col">
              {FILTROS_ABONO.map((abono) => {
                const valor = resumo.abono[abono];
                const ativo = filtros.abono === abono;
                return (
                  <li key={abono}>
                    <button
                      type="button"
                      aria-pressed={ativo}
                      disabled={valor === 0 && !ativo}
                      onClick={() => alternarAbono(abono)}
                      className={cn(
                        "flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors enabled:hover:bg-muted/60 disabled:text-muted-foreground",
                        ativo && "bg-muted ring-1 ring-ring/40",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", corDoAbono[abono])} />
                        {t(`settled.rows.${abono}`)}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{formatUsd(valor)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <CardTitle>{t("listTitle")}</CardTitle>
            {liquidacoes.length > 0 && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {temFiltro
                  ? t("results.filtered", { count: visiveis.length, total: liquidacoes.length })
                  : t("results.all", { count: visiveis.length })}
                {MOEDAS.filter((m) => totaisVisiveis[m] > 0).map((m) => (
                  <span key={m}>
                    {" · "}
                    <span className="font-medium text-foreground">{formatMoeda(totaisVisiveis[m], m)}</span>
                  </span>
                ))}
              </p>
            )}
          </div>

          {liquidacoes.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="pl-9"
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              {chipsFiltro.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("filters.label")}</span>
                  {chipsFiltro.map((chip) => (
                    <Badge key={chip.chave} variant="secondary" className="h-6 gap-1 pr-1">
                      {chip.rotulo}
                      <button
                        type="button"
                        onClick={chip.remover}
                        aria-label={t("filters.remove", { name: chip.rotulo })}
                        className="rounded-full p-0.5 hover:bg-background/60"
                      >
                        <XIcon />
                      </button>
                    </Badge>
                  ))}
                  <Button size="xs" variant="ghost" onClick={limparFiltros}>
                    {t("filters.clear")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {liquidacoes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <InboxIcon className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">{t("empty.title", { month: mesLabel })}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("empty.hint")}</p>
              </div>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/unidades" />}>
                {t("empty.action")}
              </Button>
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">{t("noFilterResults")}</p>
              <Button variant="outline" size="sm" onClick={limparFiltros}>
                {t("filters.clear")}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className={cn("hidden border-b px-3 py-2 text-xs font-medium text-muted-foreground", COLUNAS)}>
                <span>{t("columns.time")}</span>
                <span>{t("columns.unit")}</span>
                <span>{t("columns.charge")}</span>
                <span>{t("columns.method")}</span>
                <span className="justify-self-end">{t("columns.amount")}</span>
              </div>

              {dias.map((grupo) => (
                <section key={grupo.dia} aria-label={formatDia(grupo.dia)}>
                  {/* cabeçalho do dia: subtotal por moeda pra conferir com o extrato */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b bg-muted/50 px-3 py-1.5 text-xs">
                    <span className="font-medium">
                      {formatDia(grupo.dia)}
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {t("results.all", { count: grupo.liquidacoes.length })}
                      </span>
                    </span>
                    <span className="font-medium tabular-nums">
                      {MOEDAS.filter((m) => grupo.totais[m] > 0)
                        .map((m) => formatMoeda(grupo.totais[m], m))
                        .join(" · ")}
                    </span>
                  </div>

                  <ul className="divide-y border-b last:border-b-0">
                    {grupo.liquidacoes.map((l) => {
                      const abono = abonoDaLiquidacao(l, mesCaixa);
                      const abatido = l.principal_abatido_usd + l.encargos_pagos_usd;
                      // em dólar, sem sobra, o recebido é o próprio abatido: a linha extra só repetiria o valor
                      const mostrarAbatido = l.cobranca !== null && (l.moeda === "VES" || l.credito_gerado > 0);
                      const hora = formatos.hora.format(new Date(l.data_pagamento));
                      return (
                        // a linha toda leva ao detalhe; o link da unidade para a propagação do clique
                        <li
                          key={l.id}
                          onClick={() => router.push(`/liquidacoes/${l.id}`)}
                          className={cn(
                            "group relative flex cursor-pointer flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-muted/50",
                            COLUNAS,
                          )}
                        >
                          {/* celular: unidade + valor na primeira linha */}
                          <div className="flex items-baseline justify-between gap-3 sm:contents">
                            <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{hora}</span>
                            {l.unidade ? (
                              <Link
                                href={`/unidades/${l.unidade.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-medium whitespace-nowrap underline-offset-2 hover:underline"
                              >
                                {l.unidade.identificacao}
                              </Link>
                            ) : (
                              <span className="font-medium">—</span>
                            )}
                            <ValorDaLinha
                              className="sm:order-last"
                              valor={formatMoeda(l.valor_recebido, l.moeda)}
                              abatido={mostrarAbatido ? t("row.settled", { value: formatUsd(abatido) }) : null}
                              credito={l.credito_gerado > 0 ? t("row.credit", { value: formatUsd(l.credito_gerado) }) : null}
                            />
                          </div>

                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            {l.cobranca ? (
                              <>
                                <span className="min-w-0 truncate">{l.cobranca.descricao}</span>
                                {abono === "atrasado" || abono === "adiantado" ? (
                                  <Badge variant={abono === "atrasado" ? "destructive" : "outline"}>
                                    {t(`row.${abono}`, {
                                      month: formatos.mesCurto
                                        .format(new Date(`${l.cobranca.competencia.slice(0, 7)}-01T00:00:00Z`))
                                        .replace(".", ""),
                                    })}
                                  </Badge>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-muted-foreground">{t("row.noCharge")}</span>
                            )}
                          </div>

                          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex-col sm:items-start sm:gap-0 sm:text-sm">
                            <span className="text-foreground/80 sm:text-foreground">{tForma(l.forma_pagamento)}</span>
                            {l.referencia_bancaria && (
                              <span className="min-w-0 truncate font-mono text-xs">
                                <span className="sm:hidden">· </span>
                                {t("row.reference", { value: l.referencia_bancaria })}
                              </span>
                            )}
                            <span className="ml-auto tabular-nums sm:hidden">{hora}</span>
                          </div>

                          <ChevronRightIcon
                            aria-hidden
                            className="absolute top-1/2 right-1 hidden size-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 lg:block"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ValorDaLinha({
  valor,
  abatido,
  credito,
  className,
}: {
  valor: string;
  abatido: string | null;
  credito: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-end text-right sm:justify-self-end sm:pr-4", className)}>
      <span className="font-semibold whitespace-nowrap tabular-nums">{valor}</span>
      {abatido && <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{abatido}</span>}
      {credito && <span className="text-xs whitespace-nowrap text-primary tabular-nums">{credito}</span>}
    </div>
  );
}
