"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  FILTRO_COBRANCAS_PADRAO,
  type CobrancasOrganizadas,
  type FiltroCobrancas,
  type GrupoMes,
  type ItemCobranca,
} from "@/lib/lista-cobrancas";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { encontrarTasaNaData, formatUsd, formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { LiquidarCobrancaDialog } from "@/components/admin/cobrancas/liquidar-cobranca-dialog";
import { VerPagamentoDialog } from "@/components/admin/cobrancas/ver-pagamento-dialog";
import { COR_ESTADO_COBRANCA } from "@/components/unidades/cores-estado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Lista de cobranças de uma unidade (admin e portal): pendentes em cima, histórico recolhido
// embaixo, tudo agrupado por mês. O filtro fica na URL (?filtro=), como as abas da tela.

type ListaCobrancasProps = {
  organizadas: CobrancasOrganizadas;
  filtroInicial: FiltroCobrancas;
  // só o admin liquida; o portal do proprietário só consulta
  podeLiquidar: boolean;
  cotacaoAtual: { id: string; tasa_ves: number } | null;
  cotacoes: CotacaoHistorico[];
  // busca por título/subtítulo da linha (unidade ou dono): útil quando a lista tem uma linha por
  // unidade (rateio, mês de uma cuota), que num condomínio grande são centenas
  comBusca?: boolean;
};

const filtrarGrupos = (grupos: GrupoMes[], termo: string): GrupoMes[] =>
  termo
    ? grupos
        .map((g) => ({
          ...g,
          itens: g.itens.filter(
            (i) =>
              i.rotulo.titulo.toLocaleLowerCase().includes(termo) ||
              (i.rotulo.subtitulo?.toLocaleLowerCase().includes(termo) ?? false),
          ),
        }))
        .filter((g) => g.itens.length > 0)
    : grupos;

export function ListaCobrancas({
  organizadas,
  filtroInicial,
  podeLiquidar,
  cotacaoAtual,
  cotacoes,
  comBusca = false,
}: ListaCobrancasProps) {
  const t = useTranslations("listaCobrancas");
  const [filtro, setFiltro] = useState(filtroInicial);
  const [busca, setBusca] = useState("");
  // com pendências o foco é cobrar: o histórico começa recolhido
  const [historialAberto, setHistorialAberto] = useState(organizadas.quantidade.pendientes === 0);
  const termo = busca.trim().toLocaleLowerCase();
  const pendentes = filtrarGrupos(organizadas.pendentes, termo);
  const historial = filtrarGrupos(organizadas.historial, termo);

  const trocarFiltro = (novo: FiltroCobrancas) => {
    setFiltro(novo);
    const url = new URL(window.location.href);
    if (novo === FILTRO_COBRANCAS_PADRAO) url.searchParams.delete("filtro");
    else url.searchParams.set("filtro", novo);
    window.history.replaceState(null, "", url);
  };

  if (organizadas.quantidade.todos === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  const mostrarPendentes = filtro !== "pagados";
  const mostrarHistorial = filtro !== "pendientes";
  // buscando, o resultado pode estar no histórico: abre pra não esconder o que foi encontrado
  const historialVisivel = filtro === "pagados" || historialAberto || termo !== "";
  const quantidadeHistorial = historial.reduce((acc, g) => acc + g.itens.length, 0);

  return (
    <div className="flex flex-col gap-6">
      {comBusca && (
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      )}
      <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-2">
        {(["todos", "pendientes", "pagados"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filtro === f ? "secondary" : "ghost"}
            aria-pressed={filtro === f}
            onClick={() => trocarFiltro(f)}
          >
            {t(`filter.${f}`, { count: organizadas.quantidade[f] })}
          </Button>
        ))}
      </div>

      {mostrarPendentes && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-medium">{t("pending.title")}</h3>
            {organizadas.quantidade.pendientes > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">
                  {t("chargesCount", { count: organizadas.quantidade.pendientes })} ·{" "}
                </span>
                <span className="font-medium text-destructive">{formatUsd(organizadas.totalPendente)}</span>
              </p>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pending.empty")}</p>
          ) : (
            pendentes.map((grupo) => (
              <GrupoDoMes key={grupo.mes} grupo={grupo} podeLiquidar={podeLiquidar} cotacaoAtual={cotacaoAtual} cotacoes={cotacoes} />
            ))
          )}
        </section>
      )}

      {mostrarHistorial && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-medium">{t("history.title")}</h3>
            {filtro !== "pagados" && quantidadeHistorial > 0 && (
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={historialVisivel}
                onClick={() => setHistorialAberto((aberto) => !aberto)}
              >
                {historialVisivel ? t("history.hide") : t("history.show", { count: quantidadeHistorial })}
                <ChevronDownIcon className={cn("transition-transform", historialVisivel && "rotate-180")} />
              </Button>
            )}
          </div>
          {quantidadeHistorial === 0 ? (
            <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
          ) : (
            historialVisivel &&
            historial.map((grupo) => (
              <GrupoDoMes key={grupo.mes} grupo={grupo} podeLiquidar={podeLiquidar} cotacaoAtual={cotacaoAtual} cotacoes={cotacoes} />
            ))
          )}
        </section>
      )}
    </div>
  );
}

type GrupoDoMesProps = {
  grupo: GrupoMes;
  podeLiquidar: boolean;
  cotacaoAtual: ListaCobrancasProps["cotacaoAtual"];
  cotacoes: CotacaoHistorico[];
};

function GrupoDoMes({ grupo, podeLiquidar, cotacaoAtual, cotacoes }: GrupoDoMesProps) {
  const t = useTranslations("listaCobrancas");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const rotulo = grupo.mes
    ? new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${grupo.mes}-01T00:00:00Z`),
      )
    : "";

  return (
    <div className="rounded-lg border">
      {/* lista sem agrupar (detalhe de um rateio) vem num grupo só, sem mês */}
      {grupo.mes && (
        <div className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}</span>
          <span className="text-xs text-muted-foreground">
            {t("chargesCount", { count: grupo.itens.length })} · {formatUsd(grupo.total)}
          </span>
        </div>
      )}
      <ul className="divide-y">
        {grupo.itens.map((item) => (
          <LinhaCobranca key={item.cobranca.id} item={item} podeLiquidar={podeLiquidar} cotacaoAtual={cotacaoAtual} cotacoes={cotacoes} />
        ))}
      </ul>
    </div>
  );
}

function LinhaCobranca({
  item,
  podeLiquidar,
  cotacaoAtual,
  cotacoes,
}: Omit<GrupoDoMesProps, "grupo"> & { item: ItemCobranca }) {
  const t = useTranslations("listaCobrancas");
  const tTipo = useTranslations("cobrancas.tipo");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const { cobranca, estado, encargos } = item;
  const pendente = estado === "vencido" || estado === "porVencer";
  const multaJuros = encargos.valorMulta + encargos.valorJuros;

  const situacao =
    estado === "vencido"
      ? t("status.vencido", { date: formatDate(cobranca.data_vencimento), count: encargos.diasAtraso })
      : estado === "porVencer"
        ? item.emCarencia
          ? t("status.enCarencia", { date: formatDate(cobranca.data_vencimento), grace: formatDate(item.prazo) })
          : item.diasParaVencer === 0
            ? t("status.venceHoy")
            : t("status.porVencer", { date: formatDate(cobranca.data_vencimento), count: item.diasParaVencer ?? 0 })
        : estado === "conAtraso"
          ? t("status.conAtraso", { date: formatDate(item.pagoEm!), count: item.diasDepoisDoPrazo ?? 0 })
          : estado === "enDia"
            ? item.pagoEm
              ? t("status.enDia", { date: formatDate(item.pagoEm) })
              : t("status.saldadoConCredito")
            : t("status.cancelado");

  // pendente: Bs. pela cotação de hoje (ainda vai pagar); paga: pela cotação do dia do pagamento
  const tasaVes = pendente
    ? (cotacaoAtual?.tasa_ves ?? null)
    : item.pagoEm
      ? encontrarTasaNaData(cotacoes, item.pagoEm)
      : null;

  return (
    <li className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {item.rotulo.href ? (
            <Link href={item.rotulo.href} className="truncate hover:underline">
              {item.rotulo.titulo}
            </Link>
          ) : (
            <span className="truncate">{item.rotulo.titulo}</span>
          )}
          {item.rotulo.subtitulo && (
            <span className="truncate text-sm font-normal text-muted-foreground">{item.rotulo.subtitulo}</span>
          )}
          {item.rotulo.extraordinaria && <Badge variant="outline">{tTipo("extraordinaria")}</Badge>}
        </p>
        <p
          className={cn(
            "mt-0.5 flex items-center gap-1.5 text-xs",
            estado === "vencido" ? "text-destructive" : estado === "conAtraso" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          <span className={cn("size-2 shrink-0 rounded-full", COR_ESTADO_COBRANCA[estado])} />
          {situacao}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-left sm:w-64 sm:text-right">
          <p className={cn("font-medium tabular-nums", estado === "cancelado" && "text-muted-foreground line-through")}>
            {formatUsd(item.valor)}
          </p>
          {pendente && multaJuros > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("amount.pendingSplit", { principal: formatUsd(encargos.saldoDevedor), charges: formatUsd(multaJuros) })}
            </p>
          )}
          {!pendente && cobranca.valor_juros_pago_usd > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("amount.paidCharges", { charges: formatUsd(cobranca.valor_juros_pago_usd) })}
            </p>
          )}
          {cobranca.valor_credito_abatido_usd > 0 && (
            <p className="text-xs text-primary">
              {t("amount.creditApplied", { value: formatUsd(cobranca.valor_credito_abatido_usd) })}
            </p>
          )}
          {tasaVes != null && estado !== "cancelado" && (
            <p className="text-xs text-muted-foreground">{formatVes(item.valor, tasaVes)}</p>
          )}
        </div>

        {/* largura fixa pra alinhar os valores entre linhas; cabe "Liquidar" + "Ver pago" (abono parcial) */}
        <div className="flex shrink-0 gap-2 sm:w-44 sm:justify-end">
          {pendente && podeLiquidar && (
            <LiquidarCobrancaDialog
              cobrancaId={cobranca.id}
              descricao={cobranca.titulo_origem}
              saldoDevedorUsd={encargos.saldoDevedor}
              encargosUsd={multaJuros}
              cotacaoBcv={cotacaoAtual}
            />
          )}
          {cobranca.pagamentos.length > 0 && (
            <VerPagamentoDialog cobranca={cobranca} pagamentos={cobranca.pagamentos} cotacoes={cotacoes} />
          )}
        </div>
      </div>
    </li>
  );
}
