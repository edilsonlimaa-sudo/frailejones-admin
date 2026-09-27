"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
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
import { Switch } from "@/components/ui/switch";

type TaxaCondominioFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taxa: TaxaCondominio | null;
  onSaved: (taxa: TaxaCondominio) => void;
};

export function TaxaCondominioFormDialog({
  open,
  onOpenChange,
  taxa,
  onSaved,
}: TaxaCondominioFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* remount com estado limpo sempre que o dialog abre (evita setState em effect) */}
        <TaxaCondominioFormFields
          key={open ? (taxa?.id ?? "new") : "closed"}
          taxa={taxa}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type TaxaCondominioFormFieldsProps = {
  taxa: TaxaCondominio | null;
  onSaved: (taxa: TaxaCondominio) => void;
  onClose: () => void;
};

function TaxaCondominioFormFields({ taxa, onSaved, onClose }: TaxaCondominioFormFieldsProps) {
  const isEditing = Boolean(taxa);
  const t = useTranslations("taxasCondominio.form");
  const tCommon = useTranslations("common");

  const [titulo, setTitulo] = useState(taxa?.titulo ?? "");
  const [valorUsd, setValorUsd] = useState(taxa ? String(taxa.valor_usd) : "");
  const [diaVencimento, setDiaVencimento] = useState(taxa ? String(taxa.dia_vencimento) : "");
  const [pctMultaAtraso, setPctMultaAtraso] = useState(
    taxa ? String(taxa.pct_multa_atraso) : "0",
  );
  const [pctJurosDiario, setPctJurosDiario] = useState(
    taxa ? String(taxa.pct_juros_diario) : "0",
  );
  const [diasGraca, setDiasGraca] = useState(taxa ? String(taxa.dias_graca) : "0");
  const [ativo, setAtivo] = useState(taxa?.ativo ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dia = Number(diaVencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      setError(t("invalidDueDay"));
      return;
    }

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        titulo: titulo.trim(),
        valor_usd: Number(valorUsd),
        dia_vencimento: dia,
        pct_multa_atraso: Number(pctMultaAtraso || 0),
        pct_juros_diario: Number(pctJurosDiario || 0),
        dias_graca: Number(diasGraca || 0),
        ativo,
      };

      const query = isEditing
        ? supabase.from("taxa_condominio").update(payload).eq("id", taxa!.id)
        : supabase.from("taxa_condominio").insert(payload);

      const { data, error: saveError } = await query
        .select(
          "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at",
        )
        .single();

      if (saveError) throw saveError;

      onSaved(data);
      toast.success(isEditing ? t("updateSuccess") : t("createSuccess"));
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
        <DialogTitle>{isEditing ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="valor_usd">{t("valueLabel")}</Label>
            <Input
              id="valor_usd"
              type="number"
              min="0"
              step="0.01"
              required
              value={valorUsd}
              onChange={(e) => setValorUsd(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dia_vencimento">{t("dueDayLabel")}</Label>
            <Input
              id="dia_vencimento"
              type="number"
              min="1"
              max="31"
              required
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
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

        <div className="flex items-center justify-between rounded-2xl border border-input bg-input/30 px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor="ativo">{tCommon("active")}</Label>
            <span className="text-xs text-muted-foreground">{t("activeHint")}</span>
          </div>
          <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tCommon("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
