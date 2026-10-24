"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, HardHat, Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { CobrancasOrganizadas, GrupoMes, ItemCobranca } from "@/lib/lista-cobrancas";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { encontrarTasaNaData, formatUsd, formatVes, type CotacaoHistorico } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { TOP_ABAIXO_DA_BARRA, VIDRO } from "@/components/admin/barra-fixa";
import { LiquidarCobrancaDialog } from "@/components/admin/cobrancas/liquidar-cobranca-dialog";
import { VerPagamentoDialog } from "@/components/admin/cobrancas/ver-pagamento-dialog";
import { COR_ESTADO_COBRANCA } from "@/components/unidades/cores-estado";
import { MemoriaEncargosPopover } from "@/components/unidades/memoria-encargos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Lista de cobranças de uma unidade (admin e portal): pendentes em cima (o que exige ação, da
// mais antiga pra mais nova), histórico recolhido embaixo (da mais recente pra mais antiga), tudo
// agrupado por mês, um card por cobrança. As duas seções dispensam filtro.

type ListaCobrancasProps = {
  organizadas: CobrancasOrganizadas;
  // só o admin liquida; o portal do proprietário só consulta
  podeLiquidar: boolean;
  cotacaoAtual: { id: string; tasa_ves: number } | null;
  cotacoes: CotacaoHistorico[];
  // busca por título/subtítulo da linha (unidade ou dono): útil quando a lista tem uma linha por
  // unidade (rateio, mês de uma cuota), que num condomínio grande são centenas
  comBusca?: boolean;
  // cabeçalhos de mês presos de vidro abaixo da barra fixa da página. Só quando a lista está
  // direto na página (não dentro de um card, que corta o sticky e as margens negativas)
  fixar?: boolean;
};

// selo do card, na cor da situação da cobrança
const TOM_ESTADO: Record<string, string> = {
  vencido: "bg-destructive/10 text-destructive",
  porVencer: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  conAtraso: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  enDia: "bg-primary/10 text-primary",
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
  podeLiquidar,
  cotacaoAtual,
  cotacoes,
  comBusca = false,
  fixar = false,
}: ListaCobrancasProps) {
  const t = useTranslations("listaCobrancas");
  const [busca, setBusca] = useState("");
  // com pendências o foco é cobrar: o histórico começa recolhido
  const [historialAberto, setHistorialAberto] = useState(organizadas.quantidade.pendientes === 0);
  const termo = busca.trim().toLocaleLowerCase();
  const pendentes = filtrarGrupos(organizadas.pendentes, termo);
  const historial = filtrarGrupos(organizadas.historial, termo);

  if (organizadas.quantidade.todos === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  // buscando, o resultado pode estar no histórico: abre pra não esconder o que foi encontrado
  const historialVisivel = historialAberto || termo !== "";
  const quantidadeHistorial = historial.reduce((acc, g) => acc + g.itens.length, 0);
  const grupoProps = { podeLiquidar, cotacaoAtual, cotacoes, fixar };

  return (
    <div className="flex flex-col gap-6">
      {comBusca && (
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 bg-card"
        />
      )}

      {/* o que exige ação: quantidade e total pendente no título da seção */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h3 className="text-base font-semibold">
            {t("pending.title")}
            {organizadas.quantidade.pendientes > 0 && (
              <span className="font-normal text-muted-foreground">
                {" · "}
                {t("chargesCount", { count: organizadas.quantidade.pendientes })}
              </span>
            )}
          </h3>
          {organizadas.totalPendente > 0 && (
            <p className="text-sm font-semibold text-destructive tabular-nums">{formatUsd(organizadas.totalPendente)}</p>
          )}
        </div>
        {pendentes.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{t("pending.empty")}</p>
        ) : (
          pendentes.map((grupo) => <GrupoDoMes key={grupo.mes} grupo={grupo} {...grupoProps} />)
        )}
      </section>

      {/* o histórico, recolhido enquanto há pendências; o botão diz quantas cobranças esconde */}
      <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-base font-semibold">{t("history.title")}</h3>
            {quantidadeHistorial > 0 && (
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
            <p className="px-1 text-sm text-muted-foreground">{t("history.empty")}</p>
          ) : (
            historialVisivel && historial.map((grupo) => <GrupoDoMes key={grupo.mes} grupo={grupo} {...grupoProps} />)
          )}
      </section>
    </div>
  );
}

type GrupoDoMesProps = {
  grupo: GrupoMes;
  podeLiquidar: boolean;
  cotacaoAtual: ListaCobrancasProps["cotacaoAtual"];
  cotacoes: CotacaoHistorico[];
  fixar: boolean;
};

function GrupoDoMes({ grupo, podeLiquidar, cotacaoAtual, cotacoes, fixar }: GrupoDoMesProps) {
  const t = useTranslations("listaCobrancas");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const rotulo = grupo.mes
    ? new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${grupo.mes}-01T00:00:00Z`),
      )
    : "";

  return (
    <div className="flex flex-col gap-3">
      {/* lista sem agrupar (detalhe de um rateio) vem num grupo só, sem mês. Com fixar, o mês gruda
          abaixo da barra enquanto as cobranças dele rolam, e o mês seguinte o empurra */}
      {grupo.mes && (
        <div
          style={fixar ? { top: TOP_ABAIXO_DA_BARRA } : undefined}
          className={cn(
            "flex items-baseline justify-between gap-2 px-1 text-sm",
            fixar && cn("sticky z-[5] -mx-4 px-5 py-2", VIDRO),
          )}
        >
          <span className="font-semibold">{rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("chargesCount", { count: grupo.itens.length })} · {formatUsd(grupo.total)}
          </span>
        </div>
      )}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {grupo.itens.map((item) => (
          <CardCobranca key={item.cobranca.id} item={item} podeLiquidar={podeLiquidar} cotacaoAtual={cotacaoAtual} cotacoes={cotacoes} />
        ))}
      </ul>
    </div>
  );
}

function CardCobranca({
  item,
  podeLiquidar,
  cotacaoAtual,
  cotacoes,
}: Omit<GrupoDoMesProps, "grupo" | "fixar"> & { item: ItemCobranca }) {
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

  const detalhes = [
    pendente && multaJuros > 0 && (
      <p key="pendente" className="text-xs text-muted-foreground">
        {t.rich("amount.pendingSplit", {
          principal: formatUsd(encargos.saldoDevedor),
          charges: formatUsd(multaJuros),
          method: cobranca.metodo_encargos,
          memoria: (chunks) =>
            encargos.memoria ? (
              <MemoriaEncargosPopover memoria={encargos.memoria} total={multaJuros}>
                {chunks}
              </MemoriaEncargosPopover>
            ) : (
              chunks
            ),
        })}
      </p>
    ),
    !pendente && cobranca.valor_juros_pago_usd > 0 && (
      <p key="encargos" className="text-xs text-muted-foreground">
        {t("amount.paidCharges", {
          charges: formatUsd(cobranca.valor_juros_pago_usd),
          method: cobranca.metodo_encargos,
        })}
      </p>
    ),
    cobranca.valor_credito_abatido_usd > 0 && (
      <p key="credito" className="text-xs text-primary">
        {t("amount.creditApplied", { value: formatUsd(cobranca.valor_credito_abatido_usd) })}
      </p>
    ),
  ].filter(Boolean);
  const temAcoes = (pendente && podeLiquidar) || cobranca.pagamentos.length > 0;

  return (
    <li className="flex h-full flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      {/* selo na cor da situação, origem da cobrança e situação à esquerda; valor à direita */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            TOM_ESTADO[estado] ?? "bg-muted text-muted-foreground",
          )}
        >
          {item.rotulo.extraordinaria ? <HardHat className="size-5" /> : <Receipt className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight font-semibold">
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
            {cobranca.acordo && (
              <Badge variant="outline">
                {t(cobranca.acordo.quebrado_em ? "agreement.broken" : "agreement.active")}
              </Badge>
            )}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-xs",
              estado === "vencido"
                ? "text-destructive"
                : estado === "conAtraso"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground",
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-full", COR_ESTADO_COBRANCA[estado])} />
            {situacao}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-lg leading-tight font-semibold tabular-nums",
              estado === "cancelado" && "text-muted-foreground line-through",
            )}
          >
            {formatUsd(item.valor)}
          </p>
          {tasaVes != null && estado !== "cancelado" && (
            <p className="text-xs text-muted-foreground tabular-nums">{formatVes(item.valor, tasaVes)}</p>
          )}
        </div>
      </div>

      {detalhes.length > 0 && <div className="flex flex-col gap-0.5">{detalhes}</div>}

      {temAcoes && (
        <div className="mt-auto flex justify-end gap-2 border-t pt-3">
          {pendente && podeLiquidar && (
            <LiquidarCobrancaDialog cobranca={cobranca} descricao={cobranca.titulo_origem} cotacoes={cotacoes} />
          )}
          {cobranca.pagamentos.length > 0 && (
            <VerPagamentoDialog cobranca={cobranca} pagamentos={cobranca.pagamentos} cotacoes={cotacoes} />
          )}
        </div>
      )}
    </li>
  );
}
