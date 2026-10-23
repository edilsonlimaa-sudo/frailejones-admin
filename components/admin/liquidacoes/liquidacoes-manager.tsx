"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, DollarSign, InboxIcon, XIcon } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AvatarIniciais } from "@/components/admin/avatar-iniciais";
import { TOP_ABAIXO_DA_BARRA, VIDRO } from "@/components/admin/barra-fixa";
import { classesDoChip } from "@/components/admin/chip";
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

// selo do card, na cor da moeda: dólar em verde, bolívar em azul
const tomDaMoeda: Record<MoedaTipo, string> = {
  USD: "bg-primary/10 text-primary",
  VES: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

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
  return (
    <div className="flex flex-col gap-4">
      {/* "header duplo": o mês de caixa é o título (setas e grade de meses, como no Dashboard); presos
          junto, a busca e os chips de filtro. O resumo do caixa que ficava aqui já existe no card de
          Ingresos do Dashboard, então esta tela fica só com a lista */}
      <CabecalhoMes titulo={t("title")} ano={ano} mes={mes} hoje={hoje} basePath="/liquidacoes">
        <div className="pb-3">
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-10 bg-card"
          />
        </div>
        <div
          role="group"
          aria-label={t("filters.label")}
          className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {MOEDAS.map((moeda) => {
            const ativo = filtros.moeda === moeda && !filtros.forma;
            return (
              <button
                key={moeda}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternarCanal(moeda, null)}
                className={classesDoChip(ativo)}
              >
                {capitalizar(nomeMoeda(moeda))}
              </button>
            );
          })}
          {/* forma de pagamento só chega pela URL (ex.: vindo do Dashboard): mostra o chip pra poder tirar */}
          {filtros.forma && (
            <button
              type="button"
              onClick={() => aplicarFiltros({ ...filtros, forma: null })}
              aria-label={t("filters.remove", { name: tForma(filtros.forma) })}
              className={classesDoChip(true)}
            >
              {tForma(filtros.forma)}
              <XIcon className="size-3" />
            </button>
          )}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
          {FILTROS_ABONO.map((abono) => {
            const ativo = filtros.abono === abono;
            return (
              <button
                key={abono}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternarAbono(abono)}
                className={classesDoChip(ativo)}
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", corDoAbono[abono], ativo && "ring-1 ring-primary-foreground/70")}
                />
                {t(`settled.rows.${abono}`)}
              </button>
            );
          })}
          {liquidacoes.length > 0 && (
            <p className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
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
      </CabecalhoMes>

      {liquidacoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
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
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("noFilterResults")}</p>
          <Button variant="outline" size="sm" onClick={limparFiltros}>
            {t("filters.clear")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dias.map((grupo) => (
            <section key={grupo.dia} aria-label={formatDia(grupo.dia)} className="flex flex-col gap-3">
              {/* cabeçalho do dia, com o subtotal por moeda pra conferir com o extrato: gruda logo abaixo
                  da barra do mês enquanto os pagamentos do dia rolam, e o dia seguinte o empurra */}
              <div
                style={{ top: TOP_ABAIXO_DA_BARRA }}
                className={cn("sticky z-[5] -mx-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-2 text-sm", VIDRO)}
              >
                <span className="font-semibold">
                  {formatDia(grupo.dia)}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {t("results.all", { count: grupo.liquidacoes.length })}
                  </span>
                </span>
                <span className="font-medium text-muted-foreground tabular-nums">
                  {MOEDAS.filter((m) => grupo.totais[m] > 0)
                    .map((m) => formatMoeda(grupo.totais[m], m))
                    .join(" · ")}
                </span>
              </div>

              {/* um card por pagamento: moeda no selo, unidade e dono em cima, cobrança no meio, forma e hora embaixo */}
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grupo.liquidacoes.map((l) => {
                  const abono = abonoDaLiquidacao(l, mesCaixa);
                  const abatido = l.principal_abatido_usd + l.encargos_pagos_usd;
                  // em dólar, sem sobra, o recebido é o próprio abatido: a linha extra só repetiria o valor
                  const mostrarAbatido = l.cobranca !== null && (l.moeda === "VES" || l.credito_gerado > 0);
                  const hora = formatos.hora.format(new Date(l.data_pagamento));
                  return (
                    <li key={l.id}>
                      {/* o card todo leva ao detalhe; o link da unidade para a propagação do clique */}
                      <Card
                        size="sm"
                        onClick={() => router.push(`/liquidacoes/${l.id}`)}
                        className="h-full cursor-pointer transition-[box-shadow,--tw-ring-color] hover:shadow-md hover:ring-primary/40"
                      >
                        <CardContent className="flex h-full flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <span
                              className={cn(
                                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                                tomDaMoeda[l.moeda],
                              )}
                            >
                              {l.moeda === "USD" ? <DollarSign className="size-5" /> : <Banknote className="size-5" />}
                            </span>
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                              <div className="min-w-0">
                                {l.unidade ? (
                                  <Link
                                    href={`/unidades/${l.unidade.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="block text-xl leading-tight font-bold tracking-tight hover:underline"
                                  >
                                    {l.unidade.identificacao}
                                  </Link>
                                ) : (
                                  <span className="block text-xl leading-tight font-bold">—</span>
                                )}
                                {l.unidade?.proprietario && (
                                  <div className="mt-1 flex min-w-0 items-center gap-1.5">
                                    <AvatarIniciais nome={l.unidade.proprietario.nome} className="size-5 text-[9px]" />
                                    <span className="truncate text-xs text-muted-foreground">
                                      {l.unidade.proprietario.nome}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ValorDaLinha
                                valor={formatMoeda(l.valor_recebido, l.moeda)}
                                abatido={mostrarAbatido ? t("row.settled", { value: formatUsd(abatido) }) : null}
                                credito={l.credito_gerado > 0 ? t("row.credit", { value: formatUsd(l.credito_gerado) }) : null}
                              />
                            </div>
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

                          <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                            <span className="min-w-0 truncate">
                              {tForma(l.forma_pagamento)}
                              {l.referencia_bancaria && (
                                <>
                                  {" · "}
                                  <span className="font-mono">{t("row.reference", { value: l.referencia_bancaria })}</span>
                                </>
                              )}
                            </span>
                            <span className="shrink-0 tabular-nums">{hora}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
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
    <div className={cn("flex shrink-0 flex-col items-end text-right", className)}>
      <span className="font-semibold whitespace-nowrap tabular-nums">{valor}</span>
      {abatido && <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{abatido}</span>}
      {credito && <span className="text-xs whitespace-nowrap text-primary tabular-nums">{credito}</span>}
    </div>
  );
}
