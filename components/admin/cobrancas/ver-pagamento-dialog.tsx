"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";

import { calcularDiasAtrasoNaData } from "@/lib/encargos";
import { encontrarTasaNaData, type CotacaoHistorico } from "@/lib/moeda";
import { INTL_LOCALE } from "@/lib/intl-locale";
import type { FormaPagamentoTipo, PagamentoDaCobranca } from "@/lib/types/pagamentos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const vesNumberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type VerPagamentoDialogProps = {
  descricao: string;
  dataVencimento: string;
  diasGraca: number;
  pagamentos: PagamentoDaCobranca[];
  cotacoes: CotacaoHistorico[];
  triggerClassName?: string;
};

export function VerPagamentoDialog({
  descricao,
  dataVencimento,
  diasGraca,
  pagamentos,
  cotacoes,
  triggerClassName,
}: VerPagamentoDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("verPagamento");
  const locale = useLocale();
  const currencyFormatter = new Intl.NumberFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    style: "currency",
    currency: "USD",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    dateStyle: "short",
    timeStyle: "short",
  });
  const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
    pago_movil: t("paymentMethod.pago_movil"),
    transferencia: t("paymentMethod.transferencia"),
    efectivo_usd: t("paymentMethod.efectivo_usd"),
    zelle: t("paymentMethod.zelle"),
  };
  // valor_recebido já vem na moeda original do pagamento (não precisa converter)
  function formatValorRecebido(pagamento: PagamentoDaCobranca): string {
    return pagamento.moeda === "VES"
      ? `Bs. ${vesNumberFormatter.format(pagamento.valor_recebido)}`
      : currencyFormatter.format(pagamento.valor_recebido);
  }

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={() => setOpen(true)}>
        {t("trigger")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{pagamentos.length > 1 ? t("titlePlural") : t("titleSingular")}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <div className="-m-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1">
            {pagamentos.map((pagamento) => {
              const dataPagamentoIso = pagamento.data_pagamento.slice(0, 10);
              const diasAtraso = calcularDiasAtrasoNaData(dataVencimento, diasGraca, dataPagamentoIso);
              // VES: taxa exata usada naquele pagamento; USD: cotação de referência do dia (informativa)
              const cotacaoDoDia =
                pagamento.moeda === "VES"
                  ? pagamento.tasa_bcv_aplicada
                  : encontrarTasaNaData(cotacoes, dataPagamentoIso);

              return (
                <div key={pagamento.id} className="rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {dateTimeFormatter.format(new Date(pagamento.data_pagamento))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formaPagamentoLabel[pagamento.forma_pagamento]}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("amountReceived")}</dt>
                      <dd>{formatValorRecebido(pagamento)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("equivalentUsd")}</dt>
                      <dd>{currencyFormatter.format(pagamento.valor_equivalente_usd)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("principalPaid")}</dt>
                      <dd>{currencyFormatter.format(pagamento.valor_principal_abatido_usd)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("penaltyInterest")}</dt>
                      <dd>
                        {currencyFormatter.format(pagamento.valor_juros_pago_usd)}
                        {pagamento.valor_juros_pago_usd > 0 && diasAtraso > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t("daysOverdue", { count: diasAtraso })}
                          </span>
                        )}
                      </dd>
                    </div>
                    {cotacaoDoDia != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("rateOfTheDay")}</dt>
                        <dd>{t("rateValue", { rate: cotacaoDoDia })}</dd>
                      </div>
                    )}
                    {pagamento.creditoGeradoUsd > 0 && (
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">{t("creditGenerated")}</dt>
                        <dd className="font-medium text-primary">
                          {currencyFormatter.format(pagamento.creditoGeradoUsd)}
                        </dd>
                      </div>
                    )}
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">{t("bankReference")}</dt>
                      <dd>{pagamento.referencia_bancaria ?? "—"}</dd>
                    </div>
                    {pagamento.observacao && (
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">{t("observation")}</dt>
                        <dd>{pagamento.observacao}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
