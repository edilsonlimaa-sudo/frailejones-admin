"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RateioExtraordinarioFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  despesa: DespesaExtraordinaria | null;
  unidades: Unidade[];
  onSaved: (despesa: DespesaExtraordinaria) => void;
};

export function RateioExtraordinarioFormDialog({
  open,
  onOpenChange,
  despesa,
  unidades,
  onSaved,
}: RateioExtraordinarioFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col">
        {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
        <RateioExtraordinarioFormFields
          key={open ? (despesa?.id ?? "new") : "closed"}
          despesa={despesa}
          unidades={unidades}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type RateioExtraordinarioFormFieldsProps = {
  despesa: DespesaExtraordinaria | null;
  unidades: Unidade[];
  onSaved: (despesa: DespesaExtraordinaria) => void;
  onClose: () => void;
};

function RateioExtraordinarioFormFields({
  despesa,
  unidades,
  onSaved,
  onClose,
}: RateioExtraordinarioFormFieldsProps) {
  const isEditing = Boolean(despesa);
  const t = useTranslations("rateiosExtraordinarios.form");
  const tCommon = useTranslations("common");

  const [titulo, setTitulo] = useState(despesa?.titulo ?? "");
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [valorTotalUsd, setValorTotalUsd] = useState(
    despesa ? String(despesa.valor_total_usd) : "",
  );
  const [dataVencimento, setDataVencimento] = useState(despesa?.data_vencimento ?? "");
  const [pctMultaAtraso, setPctMultaAtraso] = useState(
    despesa ? String(despesa.pct_multa_atraso) : "0",
  );
  const [pctJurosDiario, setPctJurosDiario] = useState(
    despesa ? String(despesa.pct_juros_diario) : "0",
  );
  const [diasGraca, setDiasGraca] = useState(despesa ? String(despesa.dias_graca) : "0");
  const [unidadeIds, setUnidadeIds] = useState<string[]>(despesa?.unidade_ids ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // wizard: passo 1 define o rateio, passo 2 vincula as unidades (não escala mostrar as 2 coisas juntas com centenas de unidades)
  const [step, setStep] = useState<1 | 2>(1);

  const handleToggleUnidade = (unidadeId: string, checked: boolean) => {
    setUnidadeIds((prev) =>
      checked ? [...prev, unidadeId] : prev.filter((id) => id !== unidadeId),
    );
  };

  const todasSelecionadas = unidades.length > 0 && unidadeIds.length === unidades.length;
  const algumasSelecionadas = unidadeIds.length > 0 && !todasSelecionadas;

  const handleToggleTodas = (checked: boolean) => {
    setUnidadeIds(checked ? unidades.map((unidade) => unidade.id) : []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      if (!titulo.trim() || !valorTotalUsd || !dataVencimento) {
        setError(t("requiredFieldsError"));
        return;
      }
      setError(null);
      setStep(2);
      return;
    }

    if (unidadeIds.length === 0) {
      setError(t("selectAtLeastOneUnit"));
      return;
    }

    // rateio: valor por unidade é sempre derivado do valor total / quantidade de unidades selecionadas
    const valorPorUnidadeUsd = Number((Number(valorTotalUsd) / unidadeIds.length).toFixed(2));

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      // salva a despesa, sincroniza as unidades participantes e, na criação, emite uma cobrança
      // por unidade já aplicando o saldo a favor — tudo numa única transação (ver
      // salvar_rateio_extraordinario na migration)
      const { data, error: saveError } = await supabase
        .rpc("salvar_rateio_extraordinario", {
          p_id: despesa?.id ?? null,
          p_titulo: titulo.trim(),
          p_descricao: descricao.trim() || null,
          p_valor_total_usd: Number(valorTotalUsd),
          p_valor_por_unidade_usd: valorPorUnidadeUsd,
          p_data_vencimento: dataVencimento,
          p_pct_multa_atraso: Number(pctMultaAtraso || 0),
          p_pct_juros_diario: Number(pctJurosDiario || 0),
          p_dias_graca: Number(diasGraca || 0),
          p_unidade_ids: unidadeIds,
        })
        .single<Omit<DespesaExtraordinaria, "unidade_ids">>();

      if (saveError) throw saveError;

      onSaved({ ...data, unidade_ids: unidadeIds });
      toast.success(
        isEditing
          ? t("updateSuccess")
          : t("createSuccess", { count: unidadeIds.length }),
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEditing ? t("editTitle") : t("createTitle")}
          {" — "}
          {step === 1 ? t("step1Title") : t("step2Title")}
        </DialogTitle>
        <DialogDescription>
          {step === 1 ? (
            t("step1Description")
          ) : (
            <>
              {t("step2Description")}
              {!isEditing && t("step2DescriptionExtra")}
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
        {/* único trecho rolável: header e footer ficam fixos, só o corpo do passo atual rola (mobile-first) */}
        <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1">
          {step === 1 ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="titulo">{t("titleLabel")}</Label>
                <Input
                  id="titulo"
                  placeholder={t("titlePlaceholder")}
                  required
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="descricao">{t("descriptionLabel")}</Label>
                <Textarea
                  id="descricao"
                  placeholder={t("descriptionPlaceholder")}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="valor_total_usd">{t("totalValueLabel")}</Label>
                  <Input
                    id="valor_total_usd"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={valorTotalUsd}
                    onChange={(e) => setValorTotalUsd(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="data_vencimento">{t("dueDateLabel")}</Label>
                  <Input
                    id="data_vencimento"
                    type="date"
                    required
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="pct_multa_atraso">{t("penaltyLabel")}</Label>
                  <Input
                    id="pct_multa_atraso"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pctMultaAtraso}
                    onChange={(e) => setPctMultaAtraso(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pct_juros_diario">{t("dailyInterestLabel")}</Label>
                  <Input
                    id="pct_juros_diario"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={pctJurosDiario}
                    onChange={(e) => setPctJurosDiario(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dias_graca">{t("gracePeriodLabel")}</Label>
                  <Input
                    id="dias_graca"
                    type="number"
                    min="0"
                    step="1"
                    value={diasGraca}
                    onChange={(e) => setDiasGraca(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("participatingUnitsLabel")}</Label>
                <span className="text-xs text-muted-foreground">
                  {t("selectedCount", { count: unidadeIds.length, total: unidades.length })}
                </span>
              </div>
              {unidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
              ) : (
                <>
                  <label
                    htmlFor="unidade-selecionar-todas"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Checkbox
                      id="unidade-selecionar-todas"
                      checked={todasSelecionadas}
                      indeterminate={algumasSelecionadas}
                      onCheckedChange={(checked) => handleToggleTodas(checked === true)}
                    />
                    {t("selectAll")}
                  </label>
                  <div className="flex max-h-[40dvh] flex-col divide-y divide-border overflow-y-auto rounded-lg border border-input">
                    {unidades.map((unidade) => (
                      <label
                        key={unidade.id}
                        htmlFor={`unidade-${unidade.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm"
                      >
                        <Checkbox
                          id={`unidade-${unidade.id}`}
                          checked={unidadeIds.includes(unidade.id)}
                          onCheckedChange={(checked) => handleToggleUnidade(unidade.id, checked === true)}
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{unidade.identificacao}</span>
                          <span className="text-xs text-muted-foreground">
                            {unidade.proprietario?.nome ?? t("noOwner")}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {step === 2 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
            >
              {tCommon("back")}
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {step === 1 ? t("next") : isSubmitting ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
