"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const formasPagamento: FormaPagamentoTipo[] = ["pago_movil", "transferencia", "efectivo_usd", "zelle"];

// a data é escolhida pelo usuário (permite backdating), mas a hora usa o momento exato do
// registro — sem isso, todo pagamento gravava meia-noite UTC e a UI sempre mostrava o mesmo
// horário, mesmo pagamentos registrados em momentos bem diferentes do dia
function combinarDataComHoraAtual(dataIso: string): Date {
  const agora = new Date();
  const dataCompleta = new Date(`${dataIso}T00:00:00`);
  dataCompleta.setHours(agora.getHours(), agora.getMinutes(), agora.getSeconds(), agora.getMilliseconds());
  return dataCompleta;
}

type LiquidarCobrancaDialogProps = {
  unidadeId: string;
  cobrancaId: string;
  descricao: string;
  saldoDevedorUsd: number;
  encargosUsd: number;
  cotacaoBcv: { id: string; tasa_ves: number } | null;
  triggerClassName?: string;
};

export function LiquidarCobrancaDialog({
  unidadeId,
  cobrancaId,
  descricao,
  saldoDevedorUsd,
  encargosUsd,
  cotacaoBcv,
  triggerClassName,
}: LiquidarCobrancaDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const t = useTranslations("liquidarCobranca");

  return (
    <>
      <Button size="sm" className={triggerClassName} onClick={() => setOpen(true)}>
        {t("trigger")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col">
          {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
          <LiquidarCobrancaForm
            key={open ? "open" : "closed"}
            unidadeId={unidadeId}
            cobrancaId={cobrancaId}
            descricao={descricao}
            saldoDevedorUsd={saldoDevedorUsd}
            encargosUsd={encargosUsd}
            cotacaoBcv={cotacaoBcv}
            onClose={() => setOpen(false)}
            onSaved={() => router.refresh()}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type LiquidarCobrancaFormProps = {
  unidadeId: string;
  cobrancaId: string;
  descricao: string;
  saldoDevedorUsd: number;
  encargosUsd: number;
  cotacaoBcv: { id: string; tasa_ves: number } | null;
  onClose: () => void;
  onSaved: () => void;
};

function LiquidarCobrancaForm({
  unidadeId,
  cobrancaId,
  descricao,
  saldoDevedorUsd,
  encargosUsd,
  cotacaoBcv,
  onClose,
  onSaved,
}: LiquidarCobrancaFormProps) {
  const totalDevidoUsd = Number((saldoDevedorUsd + encargosUsd).toFixed(2));
  const t = useTranslations("liquidarCobranca");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const currencyFormatter = new Intl.NumberFormat(INTL_LOCALE[locale as keyof typeof INTL_LOCALE], {
    style: "currency",
    currency: "USD",
  });
  const formaPagamentoLabel: Record<FormaPagamentoTipo, string> = {
    pago_movil: t("paymentMethod.pago_movil"),
    transferencia: t("paymentMethod.transferencia"),
    efectivo_usd: t("paymentMethod.efectivo_usd"),
    zelle: t("paymentMethod.zelle"),
  };

  const [moeda, setMoeda] = useState<MoedaTipo>("USD");
  const [valorRecebido, setValorRecebido] = useState(totalDevidoUsd.toFixed(2));
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoTipo>("pago_movil");
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [referenciaBancaria, setReferenciaBancaria] = useState("");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMoedaChange = (novaMoeda: MoedaTipo) => {
    setMoeda(novaMoeda);
    // ao trocar de moeda, sugere de novo o total devido já convertido (usuário pode ajustar depois)
    const sugestao =
      novaMoeda === "VES" && cotacaoBcv
        ? totalDevidoUsd * cotacaoBcv.tasa_ves
        : totalDevidoUsd;
    setValorRecebido(sugestao.toFixed(2));
  };

  const valorRecebidoNumero = Number(valorRecebido) || 0;
  const valorEquivalenteUsd =
    moeda === "USD"
      ? valorRecebidoNumero
      : cotacaoBcv
        ? Number((valorRecebidoNumero / cotacaoBcv.tasa_ves).toFixed(2))
        : 0;

  const valorJurosPago = Math.min(valorEquivalenteUsd, encargosUsd);
  const valorPrincipalAbatido = Math.min(
    Math.max(valorEquivalenteUsd - valorJurosPago, 0),
    saldoDevedorUsd,
  );
  const sobraUsd = Number(
    Math.max(valorEquivalenteUsd - valorJurosPago - valorPrincipalAbatido, 0).toFixed(2),
  );
  const quitaCobranca = valorPrincipalAbatido >= saldoDevedorUsd - 0.01;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (valorEquivalenteUsd <= 0) {
      setError(t("errorAmountRequired"));
      return;
    }
    if (moeda === "VES" && !cotacaoBcv) {
      setError(t("errorNoRate"));
      return;
    }

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: pagamento, error: pagamentoError } = await supabase
        .from("pagamentos")
        .insert({
          unidade_id: unidadeId,
          moeda,
          valor_recebido: valorRecebidoNumero,
          cotacao_bcv_id: moeda === "VES" ? cotacaoBcv!.id : null,
          tasa_bcv_aplicada: moeda === "VES" ? cotacaoBcv!.tasa_ves : null,
          valor_equivalente_usd: valorEquivalenteUsd,
          data_pagamento: combinarDataComHoraAtual(dataPagamento).toISOString(),
          forma_pagamento: formaPagamento,
          referencia_bancaria: referenciaBancaria.trim() || null,
          observacao: observacao.trim() || null,
        })
        .select("id")
        .single();

      if (pagamentoError) throw pagamentoError;

      const { error: alocacaoError } = await supabase.from("pagamento_cobrancas").insert({
        pagamento_id: pagamento.id,
        cobranca_id: cobrancaId,
        valor_principal_abatido_usd: valorPrincipalAbatido,
        valor_juros_pago_usd: valorJurosPago,
      });

      if (alocacaoError) throw alocacaoError;

      if (sobraUsd > 0) {
        // sobra registrada na MESMA moeda do pagamento (evita perder a referência de que o
        // excedente foi de fato recebido em VES, mesmo convertendo pra USD internamente)
        const sobraNaMoedaOriginal =
          moeda === "VES" ? Number((sobraUsd * cotacaoBcv!.tasa_ves).toFixed(2)) : sobraUsd;

        const { error: creditoError } = await supabase.from("creditos_movimentacoes").insert({
          unidade_id: unidadeId,
          tipo: "ENTRADA",
          moeda,
          valor: sobraNaMoedaOriginal,
          pagamento_id: pagamento.id,
          descricao: `Sobra do pagamento da cobrança "${descricao}"`,
        });

        if (creditoError) throw creditoError;
      }

      if (quitaCobranca) {
        const { error: statusError } = await supabase
          .from("cobrancas")
          .update({ status: "pago" })
          .eq("id", cobrancaId);

        if (statusError) throw statusError;
      }

      toast.success(t("successMessage"));
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{descricao}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
          <div className="rounded-lg border border-input bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("totalDueToday")}</span>
              <span className="font-medium">{currencyFormatter.format(totalDevidoUsd)}</span>
            </div>
            {encargosUsd > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("includesPenalty", { value: currencyFormatter.format(encargosUsd) })}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("currencyReceived")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={moeda === "USD" ? "default" : "outline"}
                onClick={() => handleMoedaChange("USD")}
              >
                USD
              </Button>
              <Button
                type="button"
                variant={moeda === "VES" ? "default" : "outline"}
                disabled={!cotacaoBcv}
                onClick={() => handleMoedaChange("VES")}
              >
                VES
              </Button>
            </div>
            {!cotacaoBcv && (
              <p className="text-xs text-muted-foreground">{t("noRateHint")}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="valor_recebido">{t("amountReceived", { moeda })}</Label>
            <Input
              id="valor_recebido"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={valorRecebido}
              onChange={(e) => setValorRecebido(e.target.value)}
            />
            {moeda === "VES" && cotacaoBcv && (
              <p className="text-xs text-muted-foreground">
                {t("approxEquivalent", {
                  value: currencyFormatter.format(valorEquivalenteUsd),
                  rate: cotacaoBcv.tasa_ves,
                })}
              </p>
            )}
            {sobraUsd > 0 && (
              <p className="text-xs text-primary">
                {t("surplusHint", { value: currencyFormatter.format(sobraUsd) })}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>{t("paymentMethodLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {formasPagamento.map((forma) => (
                <Button
                  key={forma}
                  type="button"
                  variant={formaPagamento === forma ? "default" : "outline"}
                  onClick={() => setFormaPagamento(forma)}
                >
                  {formaPagamentoLabel[forma]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="data_pagamento">{t("paymentDateLabel")}</Label>
            <Input
              id="data_pagamento"
              type="date"
              required
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>

          {showDetalhes ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="referencia_bancaria">{t("bankReferenceLabel")}</Label>
                <Input
                  id="referencia_bancaria"
                  value={referenciaBancaria}
                  onChange={(e) => setReferenciaBancaria(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="observacao">{t("observationLabel")}</Label>
                <Textarea
                  id="observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="link"
              className="w-fit px-0"
              onClick={() => setShowDetalhes(true)}
            >
              {t("showDetails")}
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting
              ? t("submitting")
              : t("confirmButton", { value: currencyFormatter.format(valorEquivalenteUsd) })}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
