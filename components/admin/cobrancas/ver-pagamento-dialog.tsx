"use client";

import { useState } from "react";

import { calcularDiasAtrasoNaData } from "@/lib/encargos";
import { encontrarTasaNaData, type CotacaoHistorico } from "@/lib/moeda";
import type { FormaPagamentoTipo, PagamentoDaCobranca } from "@/lib/types/pagamentos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const vesNumberFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
  pago_movil: "Pago móvil",
  transferencia: "Transferência",
  efectivo_usd: "Efectivo (USD)",
  zelle: "Zelle",
};

// valor_recebido já vem na moeda original do pagamento (não precisa converter)
function formatValorRecebido(pagamento: PagamentoDaCobranca): string {
  return pagamento.moeda === "VES"
    ? `Bs. ${vesNumberFormatter.format(pagamento.valor_recebido)}`
    : currencyFormatter.format(pagamento.valor_recebido);
}

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

  return (
    <>
      <Button variant="outline" size="sm" className={triggerClassName} onClick={() => setOpen(true)}>
        Ver pagamento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{pagamentos.length > 1 ? "Pagamentos" : "Pagamento"}</DialogTitle>
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
                      <dt className="text-xs text-muted-foreground">Valor recebido</dt>
                      <dd>{formatValorRecebido(pagamento)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Equivalente (USD)</dt>
                      <dd>{currencyFormatter.format(pagamento.valor_equivalente_usd)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Principal abatido</dt>
                      <dd>{currencyFormatter.format(pagamento.valor_principal_abatido_usd)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Multa + juros</dt>
                      <dd>
                        {currencyFormatter.format(pagamento.valor_juros_pago_usd)}
                        {pagamento.valor_juros_pago_usd > 0 && diasAtraso > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {diasAtraso} dia(s) em atraso
                          </span>
                        )}
                      </dd>
                    </div>
                    {cotacaoDoDia != null && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Cotação do dia</dt>
                        <dd>{cotacaoDoDia} VES/USD</dd>
                      </div>
                    )}
                    {pagamento.creditoGeradoUsd > 0 && (
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">Saldo a favor gerado</dt>
                        <dd className="font-medium text-primary">
                          {currencyFormatter.format(pagamento.creditoGeradoUsd)}
                        </dd>
                      </div>
                    )}
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Referência bancária</dt>
                      <dd>{pagamento.referencia_bancaria ?? "—"}</dd>
                    </div>
                    {pagamento.observacao && (
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">Observação</dt>
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
