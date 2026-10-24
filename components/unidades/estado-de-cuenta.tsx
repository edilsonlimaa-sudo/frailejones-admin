import { CalendarClock, CircleCheck, Clock3, HandCoins, TriangleAlert, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import {
  calcularEstadoDeConta,
  type EstadoMesConta,
  type FaixaAntiguidade,
  type SituacaoConta,
} from "@/lib/estado-de-cuenta";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatMoeda, formatUsd, formatVes } from "@/lib/moeda";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import { cn } from "@/lib/utils";
import { AnelProgresso } from "@/components/admin/painel/foco/anel-progresso";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { COR_ESTADO_COBRANCA } from "@/components/unidades/cores-estado";

// Estado de conta da unidade, em cards por assunto: a situação (dívida de hoje), do que a dívida
// é feita, vencimentos e pagamentos, e o histórico de pagamento. Compartilhado entre a tela da
// unidade (admin) e o portal do proprietário: só recebe dados que cada página já carregou.

type EstadoDeCuentaProps = {
  cobrancas: CobrancaDaUnidade[];
  // saldo a favor (carteira única em dólar)
  saldoFavor: number;
  // cotação mais recente, pra mostrar a dívida também em bolívares
  tasaVes: number | null;
};

const situacaoVariant: Record<SituacaoConta, "default" | "outline" | "destructive"> = {
  alDia: "default",
  porVencer: "outline",
  enAtraso: "destructive",
};

// selo da situação: verde em dia, azul a vencer, vermelho em atraso
const tomDaSituacao: Record<SituacaoConta, string> = {
  alDia: "bg-primary/10 text-primary",
  porVencer: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  enAtraso: "bg-destructive/10 text-destructive",
};
const iconeDaSituacao: Record<SituacaoConta, typeof CircleCheck> = {
  alDia: CircleCheck,
  porVencer: Clock3,
  enAtraso: TriangleAlert,
};

const corDoMes: Record<EstadoMesConta, string> = COR_ESTADO_COBRANCA;

const corDaFaixa: Record<FaixaAntiguidade, string> = {
  porVencer: "bg-muted-foreground/40",
  d1a30: "bg-amber-400",
  d31a60: "bg-orange-500",
  d61a90: "bg-red-500",
  mas90: "bg-red-800",
};

export function EstadoDeCuenta({ cobrancas, saldoFavor, tasaVes }: EstadoDeCuentaProps) {
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
  const faixasComValor = estado.antiguidade.filter((f) => f.valor > 0);
  const maiorComposicao = Math.max(0, ...estado.composicao.map((c) => c.total));
  const IconeSituacao = iconeDaSituacao[estado.situacao];
  const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* 1. a situação: um número grande (dívida de hoje) e o selo que diz como a unidade está */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                tomDaSituacao[estado.situacao],
              )}
            >
              <IconeSituacao className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{t("debt.total")}</p>
              <p
                className={cn(
                  "text-3xl leading-tight font-bold tracking-tight tabular-nums",
                  divida.total > 0 && "text-destructive",
                )}
              >
                {formatUsd(divida.total)}
              </p>
              {divida.total > 0 && tasaVes && (
                <p className="text-sm text-muted-foreground tabular-nums">{formatVes(divida.total, tasaVes)}</p>
              )}
            </div>
            <Badge variant={situacaoVariant[estado.situacao]} className="shrink-0">
              {estado.situacao === "enAtraso" && estado.atrasoDesde
                ? t("situation.enAtraso", { date: formatDate(estado.atrasoDesde) })
                : t(`situation.${estado.situacao}`)}
            </Badge>
          </div>

          {/* do que a dívida é feita: cobros e multa/juros, numa barra só */}
          {divida.total > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-destructive" style={{ width: `${pct(divida.principal, divida.total)}%` }} />
                <div className="h-full bg-amber-500" style={{ width: `${pct(divida.encargos, divida.total)}%` }} />
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-destructive" />
                  {t("debt.principal")}
                  <span className="font-medium text-foreground tabular-nums">{formatUsd(divida.principal)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500" />
                  {t("debt.charges")}
                  <span className="font-medium text-foreground tabular-nums">{formatUsd(divida.encargos)}</span>
                </span>
              </div>
              {cobrancasVencidas > 0 && (
                <p className="text-xs text-destructive">{t("behavior.overdueUnpaid", { count: cobrancasVencidas })}</p>
              )}
            </div>
          )}

          {saldoFavor > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
              <Wallet className="size-4 shrink-0" />
              {t("creditBalance")}
              <span className="ml-auto font-semibold tabular-nums">{formatUsd(saldoFavor)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. com dívida: há quanto tempo está vencida e de que cobranças ela vem */}
      {divida.total > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card size="sm">
            <CardContent className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t("aging.title")}</h3>
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {faixasComValor.map((f) => (
                  <div
                    key={f.faixa}
                    className={cn("h-full", corDaFaixa[f.faixa])}
                    style={{ width: `${pct(f.valor, divida.total)}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-1.5 text-xs">
                {faixasComValor.map((f) => (
                  <li key={f.faixa} className="flex items-center gap-2">
                    <span className={cn("size-2.5 shrink-0 rounded-[3px]", corDaFaixa[f.faixa])} />
                    <span className="text-muted-foreground">{t(`aging.${f.faixa}`)}</span>
                    <span className="text-muted-foreground">· {t("composition.charges", { count: f.cobrancas })}</span>
                    <span className="ml-auto font-medium tabular-nums">{formatUsd(f.valor)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {estado.composicao.length > 0 && (
            <Card size="sm">
              <CardContent className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">{t("composition.title")}</h3>
                <ul className="flex flex-col gap-2.5">
                  {estado.composicao.map((item) => (
                    <li key={item.origem} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          {item.origem}
                          <span className="text-xs text-muted-foreground">
                            {" · "}
                            {t("composition.charges", { count: item.cobrancas })}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{formatUsd(item.total)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-destructive/70" style={{ width: `${pct(item.total, maiorComposicao)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 3. o que vem e o que entrou: próximo vencimento e último pagamento, lado a lado */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardContent className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-400">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("nextDue")}</p>
              {estado.proximoVencimento ? (
                <>
                  <p className="text-lg leading-tight font-semibold tabular-nums">{formatUsd(estado.proximoVencimento.valor)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(estado.proximoVencimento.data)} · {estado.proximoVencimento.origem}
                  </p>
                </>
              ) : (
                <p className="text-lg leading-tight font-semibold text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HandCoins className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("lastPayment")}</p>
              {estado.ultimoPagamento ? (
                <>
                  {/* moedas separadas, sem converter: o que entrou em bolívar fica em bolívar */}
                  <p className="text-lg leading-tight font-semibold tabular-nums">
                    {estado.ultimoPagamento.porMoeda.map((m) => formatMoeda(m.valor, m.moeda)).join(" + ")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(estado.ultimoPagamento.data)} ·{" "}
                    {estado.ultimoPagamento.formas.map((forma) => tForma(forma)).join(", ")}
                    {estado.ultimoPagamento.quantidade > 1 &&
                      ` · ${t("lastPaymentCount", { count: estado.ultimoPagamento.quantidade })}`}
                  </p>
                </>
              ) : (
                <p className="text-lg leading-tight font-semibold text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. histórico de pagamento: anel de pontualidade, dois números e a linha do tempo dos meses */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">{t("history.title", { count: estado.meses.length })}</h3>

          <div className="flex items-center gap-4">
            {comportamento.percentualEmDia === null ? (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                —
              </span>
            ) : (
              <AnelProgresso percentual={comportamento.percentualEmDia} rotulo={t("behavior.onTime")} tamanho={64} espessura={7} />
            )}
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-3">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("behavior.onTime")}</dt>
                <dd className="font-semibold tabular-nums">
                  {comportamento.percentualEmDia === null ? "—" : `${comportamento.percentualEmDia.toFixed(0)}%`}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t("behavior.averageDelay")}</dt>
                <dd className="font-semibold tabular-nums">
                  {comportamento.atrasoMedioDias === null
                    ? t("behavior.noLatePayments")
                    : t("behavior.days", { count: comportamento.atrasoMedioDias })}
                </dd>
                {comportamento.cobrancasPagasComAtraso > 0 && (
                  <dd className="text-xs text-muted-foreground">
                    {t("behavior.latePaidCount", { count: comportamento.cobrancasPagasComAtraso })}
                  </dd>
                )}
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-muted-foreground">{t("behavior.chargesPaid")}</dt>
                <dd className="font-semibold tabular-nums">{formatUsd(comportamento.encargosPagos)}</dd>
              </div>
            </dl>
          </div>

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
                  <span className="text-[11px] text-muted-foreground">{mesCurto.format(data).replace(".", "")}</span>
                </li>
              );
            })}
          </ol>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(["enDia", "conAtraso", "vencido", "porVencer"] as const).map((e) => (
              <li key={e} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 shrink-0 rounded-[3px]", corDoMes[e])} />
                {t(`timeline.states.${e}`)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
