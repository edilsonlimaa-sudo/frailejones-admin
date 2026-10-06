"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { MoedaTipo } from "@/lib/types/creditos";
import type { FormaPagamentoTipo } from "@/lib/types/pagamentos";
import {
  SIMBOLO_MOEDA,
  SOBRA_MINIMA_USD,
  formatBs,
  formatMoeda,
  formatTasa,
  formatUsd,
} from "@/lib/moeda";
import { cn } from "@/lib/utils";
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

// cada forma de pagamento só existe numa moeda (pago móvil é sempre em bolívares, Zelle e
// efectivo sempre em dólares); transferência existe nas duas. A primeira da lista é o padrão.
const formasPorMoeda: Record<MoedaTipo, FormaPagamentoTipo[]> = {
  VES: ["pago_movil", "transferencia"],
  USD: ["zelle", "efectivo_usd", "transferencia"],
};

// a data é escolhida pelo usuário (permite backdating), mas a hora usa o momento exato do
// registro — sem isso, todo pagamento gravava meia-noite UTC e a UI sempre mostrava o mesmo
// horário, mesmo pagamentos registrados em momentos bem diferentes do dia
function combinarDataComHoraAtual(dataIso: string): Date {
  const agora = new Date();
  const dataCompleta = new Date(`${dataIso}T00:00:00`);
  dataCompleta.setHours(agora.getHours(), agora.getMinutes(), agora.getSeconds(), agora.getMilliseconds());
  return dataCompleta;
}

function hojeLocalIso() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
}

const round2 = (valor: number) => Math.round(valor * 100) / 100;

type LiquidarCobrancaDialogProps = {
  cobrancaId: string;
  descricao: string;
  saldoDevedorUsd: number;
  encargosUsd: number;
  cotacaoBcv: { id: string; tasa_ves: number } | null;
  triggerClassName?: string;
};

export function LiquidarCobrancaDialog({
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
        {/* no celular vira um painel preso na base da tela (mais fácil de alcançar com o polegar) */}
        <DialogContent
          className={cn(
            "flex max-h-[90dvh] flex-col gap-5 sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:px-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
          <LiquidarCobrancaForm
            key={open ? "open" : "closed"}
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
  cobrancaId: string;
  descricao: string;
  saldoDevedorUsd: number;
  encargosUsd: number;
  cotacaoBcv: { id: string; tasa_ves: number } | null;
  onClose: () => void;
  onSaved: () => void;
};

function LiquidarCobrancaForm({
  cobrancaId,
  descricao,
  saldoDevedorUsd,
  encargosUsd,
  cotacaoBcv,
  onClose,
  onSaved,
}: LiquidarCobrancaFormProps) {
  const totalDevidoUsd = round2(saldoDevedorUsd + encargosUsd);
  const t = useTranslations("liquidarCobranca");
  const tCommon = useTranslations("common");

  // total devido convertido pra moeda do pagamento: é a sugestão do campo de valor
  const totalNaMoeda = (moeda: MoedaTipo) =>
    moeda === "VES" && cotacaoBcv ? round2(totalDevidoUsd * cotacaoBcv.tasa_ves) : totalDevidoUsd;

  // a maioria dos pagamentos é em bolívares; sem cotação, só dá pra receber em dólares
  const moedaInicial: MoedaTipo = cotacaoBcv ? "VES" : "USD";
  const [moeda, setMoeda] = useState<MoedaTipo>(moedaInicial);
  const [valorRecebido, setValorRecebido] = useState(totalNaMoeda(moedaInicial).toFixed(2));
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoTipo>(formasPorMoeda[moedaInicial][0]);
  const [dataPagamento, setDataPagamento] = useState(hojeLocalIso);
  const [referenciaBancaria, setReferenciaBancaria] = useState("");
  const [showObservacao, setShowObservacao] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMoedaChange = (novaMoeda: MoedaTipo) => {
    if (novaMoeda === moeda) return;
    setMoeda(novaMoeda);
    // ao trocar de moeda, sugere de novo o total devido já convertido (usuário pode ajustar depois)
    setValorRecebido(totalNaMoeda(novaMoeda).toFixed(2));
    if (!formasPorMoeda[novaMoeda].includes(formaPagamento)) {
      setFormaPagamento(formasPorMoeda[novaMoeda][0]);
    }
  };

  // prévia da alocação com as mesmas regras e arredondamentos de liquidar_cobranca (a função
  // recalcula tudo no banco; aqui é só pra mostrar o resultado antes de confirmar)
  const valorRecebidoNumero = Number(valorRecebido) || 0;
  const valorEquivalenteUsd =
    moeda === "USD"
      ? valorRecebidoNumero
      : cotacaoBcv
        ? round2(valorRecebidoNumero / cotacaoBcv.tasa_ves)
        : 0;
  const valorJurosPago = Math.min(valorEquivalenteUsd, encargosUsd);
  const valorPrincipalAbatido = Math.min(Math.max(valorEquivalenteUsd - valorJurosPago, 0), saldoDevedorUsd);
  const valorAlocadoUsd = valorJurosPago + valorPrincipalAbatido;
  // o que sobra depois de quitar, na MESMA moeda do pagamento; em bolívares é calculado sobre os
  // Bs. recebidos, não convertido de volta a partir do equivalente em dólares
  const sobraUsd = round2(valorEquivalenteUsd - valorAlocadoUsd);
  const faltandoUsd = round2(totalDevidoUsd - valorAlocadoUsd);
  const sobraNaMoeda =
    faltandoUsd > 0
      ? 0
      : moeda === "VES" && cotacaoBcv
        ? round2(valorRecebidoNumero - round2(valorAlocadoUsd * cotacaoBcv.tasa_ves))
        : sobraUsd;
  // como no banco: só vira saldo a favor a partir de SOBRA_MINIMA_USD (equivalente em dólar);
  // abaixo disso fica absorvida no pagamento e o modal avisa antes de confirmar
  const sobraViraSaldo = sobraUsd >= SOBRA_MINIMA_USD;
  const precisaReferencia = formaPagamento !== "efectivo_usd";

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
      // pagamento, alocação, sobra na carteira e status numa única transação (ver
      // liquidar_cobranca na migration). Os valores calculados aqui são só prévia da tela: a
      // função recalcula a alocação a partir do saldo devedor atual da cobrança
      const { error: liquidarError } = await supabase.rpc("liquidar_cobranca", {
        p_cobranca_id: cobrancaId,
        p_moeda: moeda,
        p_valor_recebido: valorRecebidoNumero,
        p_cotacao_bcv_id: moeda === "VES" ? cotacaoBcv!.id : null,
        p_encargos_usd: encargosUsd,
        p_data_pagamento: combinarDataComHoraAtual(dataPagamento).toISOString(),
        p_forma_pagamento: formaPagamento,
        p_referencia_bancaria: (precisaReferencia && referenciaBancaria.trim()) || null,
        p_observacao: observacao.trim() || null,
      });

      if (liquidarError) throw liquidarError;

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
      <DialogHeader className="pr-8">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{descricao}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 pb-1">
          {/* resumo do que é devido */}
          <section className="rounded-2xl bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground">{t("totalDueToday")}</p>
            <p className="text-2xl font-semibold tabular-nums">{formatUsd(totalDevidoUsd)}</p>
            {cotacaoBcv && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {t("approxInBs", { value: formatBs(totalDevidoUsd * cotacaoBcv.tasa_ves) })}
              </p>
            )}
            {encargosUsd > 0 && (
              <dl className="mt-3 grid gap-1 border-t border-border pt-3 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("baseAmount")}</dt>
                  <dd className="tabular-nums">{formatUsd(saldoDevedorUsd)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t("penalty")}</dt>
                  <dd className="tabular-nums">{formatUsd(encargosUsd)}</dd>
                </div>
              </dl>
            )}
          </section>

          {/* moeda */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("currencyReceived")}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/50 p-1" role="radiogroup">
              {(["VES", "USD"] as const).map((opcao) => {
                const ativa = moeda === opcao;
                const desabilitada = opcao === "VES" && !cotacaoBcv;
                return (
                  <button
                    key={opcao}
                    type="button"
                    role="radio"
                    aria-checked={ativa}
                    aria-label={t(`currency.${opcao}`)}
                    disabled={desabilitada}
                    onClick={() => handleMoedaChange(opcao)}
                    className={cn(
                      "flex h-12 flex-col items-center justify-center rounded-xl text-sm transition-colors disabled:opacity-50",
                      ativa
                        ? "bg-background font-medium shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{t(`currency.${opcao}`)}</span>
                    <span aria-hidden className="text-xs text-muted-foreground">
                      {SIMBOLO_MOEDA[opcao]}
                    </span>
                  </button>
                );
              })}
            </div>
            {!cotacaoBcv && <p className="text-xs text-muted-foreground">{t("noRateHint")}</p>}
          </fieldset>

          {/* valor recebido + prévia do resultado */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="valor_recebido">{t("amountReceived")}</Label>
              {Number(valorRecebido) !== totalNaMoeda(moeda) && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => setValorRecebido(totalNaMoeda(moeda).toFixed(2))}
                >
                  {t("useTotal")}
                </Button>
              )}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground">
                {SIMBOLO_MOEDA[moeda]}
              </span>
              <Input
                id="valor_recebido"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                value={valorRecebido}
                onChange={(e) => setValorRecebido(e.target.value)}
                onFocus={(e) => e.target.select()}
                className={cn("h-12 text-lg tabular-nums", moeda === "VES" ? "pl-12" : "pl-9")}
              />
            </div>
            {moeda === "VES" && cotacaoBcv && valorRecebidoNumero > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("equivalentInUsd", {
                  value: formatUsd(valorEquivalenteUsd),
                  rate: formatTasa(cotacaoBcv.tasa_ves),
                })}
              </p>
            )}
            {valorRecebidoNumero > 0 && (
              <div
                className={cn(
                  "grid gap-1 rounded-xl px-3 py-2 text-xs",
                  faltandoUsd > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                )}
              >
                <p>
                  {faltandoUsd > 0
                    ? t("remaining", { value: formatUsd(faltandoUsd) })
                    : sobraViraSaldo
                      ? t(moeda === "VES" ? "surplusVes" : "surplusUsd", {
                          value: formatMoeda(sobraNaMoeda, moeda),
                        })
                      : t("coversTotal")}
                </p>
                {!sobraViraSaldo && sobraNaMoeda > 0 && (
                  <p className="text-muted-foreground">
                    {t("surplusBelowMinimum", {
                      value: formatMoeda(sobraNaMoeda, moeda),
                      minimum: formatUsd(SOBRA_MINIMA_USD),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* forma de pagamento: só as que existem na moeda escolhida */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("paymentMethodLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {formasPorMoeda[moeda].map((forma) => (
                <Button
                  key={forma}
                  type="button"
                  variant={formaPagamento === forma ? "default" : "outline"}
                  aria-pressed={formaPagamento === forma}
                  className="h-10 flex-1 basis-[calc(50%-0.25rem)] sm:basis-0"
                  onClick={() => setFormaPagamento(forma)}
                >
                  {t(`paymentMethod.${forma}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className={cn("grid gap-4", precisaReferencia && "sm:grid-cols-2")}>
            <div className="grid gap-2">
              <Label htmlFor="data_pagamento">{t("paymentDateLabel")}</Label>
              <Input
                id="data_pagamento"
                type="date"
                required
                max={hojeLocalIso()}
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                className="h-10"
              />
            </div>
            {precisaReferencia && (
              <div className="grid gap-2">
                <Label htmlFor="referencia_bancaria">
                  {t("bankReferenceLabel")}{" "}
                  <span className="font-normal text-muted-foreground">({t("optional")})</span>
                </Label>
                <Input
                  id="referencia_bancaria"
                  inputMode="numeric"
                  autoComplete="off"
                  value={referenciaBancaria}
                  onChange={(e) => setReferenciaBancaria(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
          </div>

          {showObservacao ? (
            <div className="grid gap-2">
              <Label htmlFor="observacao">{t("observationLabel")}</Label>
              <Textarea
                id="observacao"
                autoFocus
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto w-fit px-0"
              onClick={() => setShowObservacao(true)}
            >
              {t("addObservation")}
            </Button>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {tCommon("cancel")}
          </Button>
          <Button type="submit" className="h-11 flex-[2]" disabled={isSubmitting || valorRecebidoNumero <= 0}>
            {isSubmitting
              ? t("submitting")
              : t("confirmButton", { value: formatMoeda(valorRecebidoNumero, moeda) })}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
