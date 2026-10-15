"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { hojeCaracas } from "@/lib/fuso";
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
import {
  CamposEncargos,
  regrasDoForm,
  regrasFormIniciais,
} from "@/components/admin/encargos/campos-encargos";

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

// vencimento da taxa no mês corrente (Caracas), só pra prévia dos encargos: dia inválido vira 1
// e dia maior que o mês cai no último dia
function vencimentoNoMesAtual(dia: number): string {
  const [ano, mes] = hojeCaracas().split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaValido = Number.isInteger(dia) && dia >= 1 ? Math.min(dia, ultimoDia) : 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(diaValido).padStart(2, "0")}`;
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
  const [regras, setRegras] = useState(() => regrasFormIniciais(taxa ?? undefined));
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
        ...regrasDoForm(regras),
        ativo,
      };

      const query = isEditing
        ? supabase.from("taxa_condominio").update(payload).eq("id", taxa!.id)
        : supabase.from("taxa_condominio").insert(payload);

      const { data, error: saveError } = await query
        .select(
          "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, metodo_encargos, pct_juros_mensal, criterio_mes, ativo, created_at",
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

        <CamposEncargos
          value={regras}
          onChange={setRegras}
          valorExemplo={Number(valorUsd) > 0 ? Number(valorUsd) : 100}
          vencimentoExemplo={vencimentoNoMesAtual(Number(diaVencimento))}
        />

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
