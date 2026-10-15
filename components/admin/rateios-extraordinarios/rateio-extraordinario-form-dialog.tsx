"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { hojeCaracas } from "@/lib/fuso";
import { paramsRegrasEncargos } from "@/lib/encargos";
import { formatUsd } from "@/lib/moeda";
import type { DespesaExtraordinaria } from "@/lib/types/despesas-extraordinarias";
import type { Unidade } from "@/lib/types/unidades";
import { Button } from "@/components/ui/button";
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
import { SeletorUnidades } from "@/components/admin/unidades/seletor-unidades";
import {
  CamposEncargos,
  regrasDoForm,
  regrasFormIniciais,
} from "@/components/admin/encargos/campos-encargos";

type RateioExtraordinarioFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidades: Unidade[];
  onSaved: (despesa: DespesaExtraordinaria) => void;
};

// só cadastro: o rateio emite as cobranças no momento em que é salvo, e depois disso não é
// editável (valor, unidades, vencimento e regras já foram copiados para cada cobrança)
export function RateioExtraordinarioFormDialog({
  open,
  onOpenChange,
  unidades,
  onSaved,
}: RateioExtraordinarioFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-2xl sobrescreve o sm:max-w-md do DialogContent (max-w-2xl sozinho perdia pra ele) */}
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
        <RateioExtraordinarioFormFields
          key={open ? "new" : "closed"}
          unidades={unidades}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type RateioExtraordinarioFormFieldsProps = {
  unidades: Unidade[];
  onSaved: (despesa: DespesaExtraordinaria) => void;
  onClose: () => void;
};

function RateioExtraordinarioFormFields({
  unidades,
  onSaved,
  onClose,
}: RateioExtraordinarioFormFieldsProps) {
  const t = useTranslations("rateiosExtraordinarios.form");
  const tCommon = useTranslations("common");

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorTotalUsd, setValorTotalUsd] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");
  const [regras, setRegras] = useState(() => regrasFormIniciais());
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // wizard: passo 1 define o rateio, passo 2 vincula as unidades (não escala mostrar as 2 coisas juntas com centenas de unidades)
  const [step, setStep] = useState<1 | 2>(1);

  const unidadeIds = [...selecionados];
  // rateio: valor por unidade é sempre derivado do valor total / quantidade de unidades selecionadas
  const valorPorUnidadeUsd =
    unidadeIds.length > 0 && valorTotalUsd ? Number((Number(valorTotalUsd) / unidadeIds.length).toFixed(2)) : 0;

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

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      // cria a despesa, vincula as unidades participantes e emite uma cobrança por unidade já
      // aplicando o saldo a favor — tudo numa única transação (ver salvar_rateio_extraordinario
      // na migration)
      const { data, error: saveError } = await supabase
        .rpc("salvar_rateio_extraordinario", {
          p_id: null,
          p_titulo: titulo.trim(),
          p_descricao: descricao.trim() || null,
          p_valor_total_usd: Number(valorTotalUsd),
          p_valor_por_unidade_usd: valorPorUnidadeUsd,
          p_data_vencimento: dataVencimento,
          ...paramsRegrasEncargos(regrasDoForm(regras)),
          p_unidade_ids: unidadeIds,
        })
        .single<Omit<DespesaExtraordinaria, "unidade_ids">>();

      if (saveError) throw saveError;

      onSaved({ ...data, unidade_ids: unidadeIds });
      toast.success(t("createSuccess", { count: unidadeIds.length }));
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
          {t("createTitle")}
          {" — "}
          {step === 1 ? t("step1Title") : t("step2Title")}
        </DialogTitle>
        <DialogDescription>
          {step === 1 ? t("step1Description") : t("step2Description")}
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

              <CamposEncargos
                value={regras}
                onChange={setRegras}
                valorExemplo={100}
                vencimentoExemplo={dataVencimento || hojeCaracas()}
              />
            </>
          ) : (
            <SeletorUnidades
              unidades={unidades}
              selecionados={selecionados}
              onChange={setSelecionados}
              idPrefixo="rateio-unidade"
              classNameGrade="sm:grid-cols-2"
              // busca e filtros grudam no topo enquanto a lista rola dentro do dialog
              classNameBarra="sticky top-0 z-10 -mx-1 bg-popover px-1 pb-2"
            />
          )}

          {/* último momento de revisão: depois de salvar as cobranças já existem e o rateio não
              pode mais ser editado */}
          {step === 2 && unidadeIds.length > 0 && (
            <div
              role="note"
              className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>
                {t("lockedNotice")}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:items-center">
          {/* resumo vivo do que vai ser emitido, ao lado da ação que emite */}
          {step === 2 && (
            <p className="order-last text-sm text-muted-foreground sm:order-first sm:mr-auto">
              {unidadeIds.length > 0 ? (
                <>
                  <span className="font-medium text-foreground">
                    {t("chargesSummary", { count: unidadeIds.length })}
                  </span>
                  {" · "}
                  {t("perUnit", { value: formatUsd(valorPorUnidadeUsd) })}
                </>
              ) : (
                t("selectAtLeastOneUnit")
              )}
            </p>
          )}
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
          <Button type="submit" disabled={isSubmitting || (step === 2 && unidadeIds.length === 0)}>
            {step === 1 ? t("next") : isSubmitting ? tCommon("saving") : t("emitCharges")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
