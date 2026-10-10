import { useLocale, useTranslations } from "next-intl";

import {
  calcularEstadoDeConta,
  type EstadoMesConta,
  type FaixaAntiguidade,
  type SituacaoConta,
} from "@/lib/estado-de-cuenta";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatBs, formatMoeda, formatUsd, formatVes } from "@/lib/moeda";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Estado de conta da unidade: situação, dívida, antiguidade, últimos 12 meses, comportamento de
// pagamento e composição do que deve. Compartilhado entre a tela da unidade (admin) e o portal do
// proprietário: só recebe dados que cada página já carregou, não faz consulta própria.

type EstadoDeCuentaProps = {
  cobrancas: CobrancaDaUnidade[];
  saldoFavorUsd: number;
  saldoFavorVes: number;
  // cotação mais recente, pra mostrar a dívida também em bolívares
  tasaVes: number | null;
};

const situacaoVariant: Record<SituacaoConta, "default" | "outline" | "destructive"> = {
  alDia: "default",
  porVencer: "outline",
  enAtraso: "destructive",
};

// cores da linha do tempo e da antiguidade: verde = em dia, âmbar = atrasou, vermelho = vencido
const corDoMes: Record<EstadoMesConta, string> = {
  enDia: "bg-primary",
  conAtraso: "bg-amber-500",
  vencido: "bg-destructive",
  porVencer: "bg-muted border border-muted-foreground/40",
  sinCobros: "border border-dashed border-border",
};

const corDaFaixa: Record<FaixaAntiguidade, string> = {
  porVencer: "bg-muted-foreground/40",
  d1a30: "bg-amber-400",
  d31a60: "bg-orange-500",
  d61a90: "bg-red-500",
  mas90: "bg-red-800",
};

export function EstadoDeCuenta({ cobrancas, saldoFavorUsd, saldoFavorVes, tasaVes }: EstadoDeCuentaProps) {
  const t = useTranslations("estadoCuenta");
  const tForma = useTranslations("liquidacoes.paymentMethod");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const mesCurto = new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" });
  const mesLongo = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" });

  const estado = calcularEstadoDeConta(cobrancas, new Date());
  const { divida, comportamento } = estado;
  const cobrancasVencidas = estado.antiguidade
    .filter((f) => f.faixa !== "porVencer")
    .reduce((acc, f) => acc + f.cobrancas, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("title")}</CardTitle>
          <Badge variant={situacaoVariant[estado.situacao]}>
            {estado.situacao === "enAtraso" && estado.atrasoDesde
              ? t("situation.enAtraso", { date: formatDate(estado.atrasoDesde) })
              : t(`situation.${estado.situacao}`)}
          </Badge>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* 1. situação e saldo */}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">{t("debt.total")}</dt>
            <dd className={cn("text-xl font-medium", divida.total > 0 && "text-destructive")}>
              {formatUsd(divida.total)}
            </dd>
            {divida.total > 0 && (
              <dd className="text-xs text-muted-foreground">
                {tasaVes && <span className="block">{formatVes(divida.total, tasaVes)}</span>}
                {t("debt.split", { principal: formatUsd(divida.principal), charges: formatUsd(divida.encargos) })}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("creditBalance")}</dt>
            <dd className="font-medium">{formatUsd(saldoFavorUsd)}</dd>
            {saldoFavorVes > 0 && <dd className="text-xs text-muted-foreground">+ {formatBs(saldoFavorVes)}</dd>}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("nextDue")}</dt>
            {estado.proximoVencimento ? (
              <>
                <dd className="font-medium">{formatUsd(estado.proximoVencimento.valor)}</dd>
                <dd className="text-xs text-muted-foreground">
                  {estado.proximoVencimento.origem} · {formatDate(estado.proximoVencimento.data)}
                </dd>
              </>
            ) : (
              <dd className="font-medium">—</dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("lastPayment")}</dt>
            {estado.ultimoPagamento ? (
              <>
                {/* moedas separadas, sem converter: o que entrou em bolívar fica em bolívar */}
                <dd className="font-medium">
                  {estado.ultimoPagamento.porMoeda.map((m) => formatMoeda(m.valor, m.moeda)).join(" + ")}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {formatDate(estado.ultimoPagamento.data)} ·{" "}
                  {estado.ultimoPagamento.formas.map((forma) => tForma(forma)).join(", ")}
                </dd>
                {/* um pagamento por cobrança: sem isto, "2 pagos" num dia parece pagamento duplicado */}
                {estado.ultimoPagamento.quantidade > 1 && (
                  <dd className="text-xs text-muted-foreground">
                    {t("lastPaymentCount", { count: estado.ultimoPagamento.quantidade })}
                  </dd>
                )}
              </>
            ) : (
              <dd className="font-medium">—</dd>
            )}
          </div>
        </dl>

        {/* 2. antiguidade da dívida */}
        {divida.total > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("aging.title")}</h3>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {estado.antiguidade
                .filter((f) => f.valor > 0)
                .map((f) => (
                  <div
                    key={f.faixa}
                    className={cn("h-full", corDaFaixa[f.faixa])}
                    style={{ width: `${(f.valor / divida.total) * 100}%` }}
                  />
                ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-5">
              {estado.antiguidade.map((f) => (
                <li key={f.faixa} className={cn("flex items-center gap-1.5", f.valor === 0 && "opacity-50")}>
                  <span className={cn("size-2.5 shrink-0 rounded-[2px]", corDaFaixa[f.faixa])} />
                  <span className="text-muted-foreground">{t(`aging.${f.faixa}`)}</span>
                  <span className="ml-auto font-medium tabular-nums">{formatUsd(f.valor)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 3. linha do tempo dos últimos 12 meses */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("timeline.title", { count: estado.meses.length })}</h3>
          <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {estado.meses.map((m) => {
              const data = new Date(`${m.mes}-01T00:00:00Z`);
              const detalhe = m.cobrancas
                .map((c) => `${c.origem}: ${t(`timeline.states.${c.estado}`)} (${formatUsd(c.valor)})`)
                .join("\n");
              const rotulo = `${mesLongo.format(data)} — ${t(`timeline.states.${m.estado}`)}`;
              return (
                <li key={m.mes} className="flex flex-col items-center gap-1">
                  <span
                    role="img"
                    aria-label={detalhe ? `${rotulo}. ${detalhe.replace(/\n/g, "; ")}` : rotulo}
                    title={detalhe ? `${rotulo}\n${detalhe}` : rotulo}
                    className={cn("h-7 w-full rounded-md", corDoMes[m.estado])}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {mesCurto.format(data).replace(".", "")}
                  </span>
                </li>
              );
            })}
          </ol>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(["enDia", "conAtraso", "vencido", "porVencer"] as const).map((e) => (
              <li key={e} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 shrink-0 rounded-[2px]", corDoMes[e])} />
                {t(`timeline.states.${e}`)}
              </li>
            ))}
          </ul>
        </section>

        {/* 4. comportamento de pagamento */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("behavior.title", { count: estado.meses.length })}</h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t("behavior.onTime")}</dt>
              <dd className="font-medium">
                {comportamento.percentualEmDia === null ? "—" : `${comportamento.percentualEmDia.toFixed(0)}%`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("behavior.averageDelay")}</dt>
              <dd className="font-medium">
                {comportamento.atrasoMedioDias === null
                  ? t("behavior.noLatePayments")
                  : t("behavior.days", { count: comportamento.atrasoMedioDias })}
              </dd>
              {comportamento.cobrancasPagasComAtraso > 0 && (
                <dd className="text-xs text-muted-foreground">
                  {t("behavior.latePaidCount", { count: comportamento.cobrancasPagasComAtraso })}
                </dd>
              )}
              {/* o atraso médio só conta o que já foi pago: quem parou de pagar teria "nenhum pago
                  fora do prazo" ao lado de "en atraso". Mostra as vencidas em aberto pra não parecer
                  que a unidade nunca atrasa */}
              {cobrancasVencidas > 0 && (
                <dd className="text-xs text-destructive">
                  {t("behavior.overdueUnpaid", { count: cobrancasVencidas })}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("behavior.chargesPaid")}</dt>
              <dd className="font-medium">{formatUsd(comportamento.encargosPagos)}</dd>
            </div>
          </dl>
        </section>

        {/* 5. composição do que deve */}
        {estado.composicao.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("composition.title")}</h3>
            <ul className="flex flex-col gap-2">
              {estado.composicao.map((item) => (
                <li key={item.origem} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {item.origem}
                    <span className="text-xs text-muted-foreground">
                      {" · "}
                      {t("composition.charges", { count: item.cobrancas })}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatUsd(item.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
