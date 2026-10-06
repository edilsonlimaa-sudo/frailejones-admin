"use client";

import { useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CircleCheck, CircleAlert } from "lucide-react";

import { calcularDiasAtrasoNaData, calcularEncargos } from "@/lib/encargos";
import { formatBs, formatMoeda, formatTasa, formatUsd, encontrarTasaNaData, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { cn } from "@/lib/utils";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { PagamentoDaCobranca } from "@/lib/types/pagamentos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const round2 = (valor: number) => Math.round(valor * 100) / 100;

type CobrancaDoPagamento = Pick<
  CobrancaDaUnidade,
  | "descricao"
  | "valor_usd"
  | "valor_credito_abatido_usd"
  | "data_vencimento"
  | "dias_graca"
  | "pct_multa_atraso"
  | "pct_juros_diario"
>;

// reconstrói, pra um pagamento, o que a cobrança devia no momento e o que o pagamento registrou.
// Cota pendente é exata (valor - saldo a favor aplicado na emissão - principal dos pagamentos
// anteriores). Multa/juros do dia: se o pagamento chegou a abater principal, eles foram pagos
// inteiros, então valor_juros_pago_usd é o valor exato; se o pagamento nem cobriu os encargos,
// recalcula com a mesma regra usada na liquidação (lib/encargos).
function analisarPagamento(
  cobranca: CobrancaDoPagamento,
  pagamento: PagamentoDaCobranca,
  principalPagoAntes: number,
  cotacoes: CotacaoHistorico[],
) {
  const dataIso = pagamento.data_pagamento.slice(0, 10);
  const cotaPendente = round2(
    Math.max(cobranca.valor_usd - cobranca.valor_credito_abatido_usd - principalPagoAntes, 0),
  );
  const encargosCalculados = calcularEncargos(
    { ...cobranca, status: "pendente", valor_principal_pago_usd: principalPagoAntes },
    dataIso,
  );
  const encargosNaData =
    pagamento.valor_principal_abatido_usd > 0
      ? pagamento.valor_juros_pago_usd
      : Math.max(encargosCalculados.valorMulta + encargosCalculados.valorJuros, pagamento.valor_juros_pago_usd);
  const totalDevido = round2(cotaPendente + encargosNaData);

  const alocadoUsd = round2(pagamento.valor_juros_pago_usd + pagamento.valor_principal_abatido_usd);
  // VES: taxa exata usada no pagamento; USD: cotação de referência do dia (só informativa)
  const tasa =
    pagamento.moeda === "VES" ? pagamento.tasa_bcv_aplicada : encontrarTasaNaData(cotacoes, dataIso);

  // o que sobrou depois de quitar, na moeda do pagamento, menos o que virou saldo a favor: o resto
  // ficou absorvido no pagamento (abaixo do mínimo pra saldo, ou resíduo de arredondamento)
  const creditadoNaMoeda = pagamento.creditosGerados
    .filter((c) => c.moeda === pagamento.moeda)
    .reduce((acc, c) => acc + c.valor, 0);
  const sobraNaMoeda =
    pagamento.moeda === "VES" && pagamento.tasa_bcv_aplicada
      ? pagamento.valor_recebido - round2(alocadoUsd * pagamento.tasa_bcv_aplicada)
      : pagamento.valor_equivalente_usd - alocadoUsd;
  const faltando = round2(totalDevido - alocadoUsd);
  // em pagamento parcial a "sobra" em Bs. é só ruído da conversão, não dinheiro a mais
  const naoCreditado = faltando > 0 ? 0 : Math.max(round2(sobraNaMoeda - creditadoNaMoeda), 0);

  return {
    diasAtraso: calcularDiasAtrasoNaData(cobranca.data_vencimento, cobranca.dias_graca, dataIso),
    cotaPendente,
    encargosNaData,
    totalDevido,
    tasa,
    faltando,
    naoCreditado,
  };
}

function Linha({
  label,
  valor,
  className,
  children,
}: {
  label: ReactNode;
  valor: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <dt className="text-muted-foreground">
        {label}
        {children}
      </dt>
      <dd className="shrink-0 text-right tabular-nums">{valor}</dd>
    </div>
  );
}

type VerPagamentoDialogProps = {
  cobranca: CobrancaDoPagamento;
  pagamentos: PagamentoDaCobranca[];
  cotacoes: CotacaoHistorico[];
  triggerClassName?: string;
};

export function VerPagamentoDialog({ cobranca, pagamentos, cotacoes, triggerClassName }: VerPagamentoDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("verPagamento");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" });
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, { dateStyle: "short" });

  // em ordem cronológica, acumulando o principal já abatido pelos pagamentos anteriores
  const ordenados = [...pagamentos].sort((a, b) => a.data_pagamento.localeCompare(b.data_pagamento));
  const analisados = ordenados.map((pagamento, indice) => {
    const principalPagoAntes = ordenados
      .slice(0, indice)
      .reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0);
    return {
      pagamento,
      analise: analisarPagamento(cobranca, pagamento, principalPagoAntes, cotacoes),
      principalPagoAntes,
    };
  });

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={() => setOpen(true)}>
        {t("trigger")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* no celular vira um painel preso na base da tela, como o modal de liquidação */}
        <DialogContent
          className={cn(
            "flex max-h-[90dvh] flex-col gap-5 sm:max-w-2xl",
            "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:px-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{pagamentos.length > 1 ? t("titlePlural") : t("titleSingular")}</DialogTitle>
            <DialogDescription>{cobranca.descricao}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-1">
            {analisados.map(({ pagamento, analise, principalPagoAntes: pagoAntes }, indice) => (
              <article key={pagamento.id} className="rounded-2xl border border-border p-4">
                <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium">
                    {analisados.length > 1 && (
                      <span className="text-muted-foreground">
                        {t("paymentNumber", { n: indice + 1, total: analisados.length })} ·{" "}
                      </span>
                    )}
                    {dateTimeFormatter.format(new Date(pagamento.data_pagamento))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`paymentMethod.${pagamento.forma_pagamento}`)}
                    {pagamento.referencia_bancaria && ` · ${t("reference", { ref: pagamento.referencia_bancaria })}`}
                  </p>
                </header>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {/* o que a cobrança devia no momento do pagamento */}
                  <section className="rounded-xl bg-muted/50 p-3">
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                      {t("owedOn", { date: dateFormatter.format(new Date(pagamento.data_pagamento)) })}
                    </h3>
                    <dl className="grid gap-1.5 text-sm">
                      <Linha label={t("fee")} valor={formatUsd(cobranca.valor_usd)} />
                      {cobranca.valor_credito_abatido_usd > 0 && indice === 0 && (
                        <Linha
                          label={t("creditApplied")}
                          valor={`− ${formatUsd(cobranca.valor_credito_abatido_usd)}`}
                        />
                      )}
                      {pagoAntes > 0 && (
                        <Linha label={t("paidBefore")} valor={`− ${formatUsd(pagoAntes)}`} />
                      )}
                      {analise.encargosNaData > 0 && (
                        <Linha label={t("penaltyInterest")} valor={formatUsd(analise.encargosNaData)}>
                          {analise.diasAtraso > 0 && (
                            <span className="block text-xs">{t("daysOverdue", { count: analise.diasAtraso })}</span>
                          )}
                        </Linha>
                      )}
                      <Linha
                        label={t("totalOwed")}
                        valor={formatUsd(analise.totalDevido)}
                        className="mt-1 border-t border-border pt-2 font-medium [&_dt]:text-foreground"
                      />
                      {analise.tasa != null && (
                        <p className="text-right text-xs text-muted-foreground tabular-nums">
                          ≈ {formatBs(analise.totalDevido * analise.tasa)}
                        </p>
                      )}
                    </dl>
                  </section>

                  {/* o que o pagamento registrou */}
                  <section className="rounded-xl border border-border p-3">
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("recorded")}</h3>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoeda(pagamento.valor_recebido, pagamento.moeda)}
                    </p>
                    {pagamento.moeda === "VES" && pagamento.tasa_bcv_aplicada != null && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {t("equivalentAtRate", {
                          value: formatUsd(pagamento.valor_equivalente_usd),
                          rate: formatTasa(pagamento.tasa_bcv_aplicada),
                        })}
                      </p>
                    )}
                    <dl className="mt-3 grid gap-1.5 text-sm">
                      {pagamento.valor_juros_pago_usd > 0 && (
                        <Linha label={t("toPenalty")} valor={formatUsd(pagamento.valor_juros_pago_usd)} />
                      )}
                      <Linha label={t("toFee")} valor={formatUsd(pagamento.valor_principal_abatido_usd)} />
                      {pagamento.creditosGerados.map((credito, i) => (
                        <Linha
                          key={i}
                          label={t("creditGenerated")}
                          valor={formatMoeda(credito.valor, credito.moeda)}
                          className="font-medium text-primary [&_dt]:text-primary"
                        />
                      ))}
                      {analise.naoCreditado > 0 && (
                        <Linha
                          label={t("notCredited")}
                          valor={formatMoeda(analise.naoCreditado, pagamento.moeda)}
                        />
                      )}
                    </dl>
                  </section>
                </div>

                <p
                  className={cn(
                    "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
                    analise.faltando > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                  )}
                >
                  {analise.faltando > 0 ? (
                    <>
                      <CircleAlert className="size-4 shrink-0" />
                      {t("remaining", { value: formatUsd(analise.faltando) })}
                    </>
                  ) : (
                    <>
                      <CircleCheck className="size-4 shrink-0" />
                      {t("settled")}
                    </>
                  )}
                </p>

                {pagamento.observacao && (
                  <p className="mt-3 text-sm">
                    <span className="text-xs text-muted-foreground">{t("observation")}: </span>
                    {pagamento.observacao}
                  </p>
                )}
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
