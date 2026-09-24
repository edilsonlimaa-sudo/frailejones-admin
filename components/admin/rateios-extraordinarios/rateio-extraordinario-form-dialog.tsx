"use client";

import { useState } from "react";
import { toast } from "sonner";

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
      <DialogContent className="max-w-lg">
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

function calcularValorPorUnidade(valorTotal: string, quantidadeUnidades: number) {
  const total = Number(valorTotal);
  if (!quantidadeUnidades || !Number.isFinite(total)) return "";
  return (total / quantidadeUnidades).toFixed(2);
}

function RateioExtraordinarioFormFields({
  despesa,
  unidades,
  onSaved,
  onClose,
}: RateioExtraordinarioFormFieldsProps) {
  const isEditing = Boolean(despesa);

  const [titulo, setTitulo] = useState(despesa?.titulo ?? "");
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [valorTotalUsd, setValorTotalUsd] = useState(
    despesa ? String(despesa.valor_total_usd) : "",
  );
  const [valorPorUnidadeUsd, setValorPorUnidadeUsd] = useState(
    despesa ? String(despesa.valor_por_unidade_usd) : "",
  );
  const [valorPorUnidadeTocado, setValorPorUnidadeTocado] = useState(isEditing);
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

  const handleValorTotalChange = (value: string) => {
    setValorTotalUsd(value);
    if (!valorPorUnidadeTocado) {
      setValorPorUnidadeUsd(calcularValorPorUnidade(value, unidadeIds.length));
    }
  };

  const handleToggleUnidade = (unidadeId: string, checked: boolean) => {
    const next = checked
      ? [...unidadeIds, unidadeId]
      : unidadeIds.filter((id) => id !== unidadeId);
    setUnidadeIds(next);
    if (!valorPorUnidadeTocado) {
      setValorPorUnidadeUsd(calcularValorPorUnidade(valorTotalUsd, next.length));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (unidadeIds.length === 0) {
      setError("Selecione ao menos uma unidade participante.");
      return;
    }

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        valor_total_usd: Number(valorTotalUsd),
        valor_por_unidade_usd: Number(valorPorUnidadeUsd),
        data_vencimento: dataVencimento,
        pct_multa_atraso: Number(pctMultaAtraso || 0),
        pct_juros_diario: Number(pctJurosDiario || 0),
        dias_graca: Number(diasGraca || 0),
      };

      const query = isEditing
        ? supabase.from("despesas_extraordinarias").update(payload).eq("id", despesa!.id)
        : supabase.from("despesas_extraordinarias").insert(payload);

      const { data, error: saveError } = await query
        .select(
          "id, titulo, descricao, valor_total_usd, valor_por_unidade_usd, data_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, created_at",
        )
        .single();

      if (saveError) throw saveError;

      // sincroniza as unidades participantes: remove o vínculo anterior e recria com a seleção atual
      const { error: deleteVinculosError } = await supabase
        .from("despesa_extraordinaria_unidades")
        .delete()
        .eq("despesa_extraordinaria_id", data.id);
      if (deleteVinculosError) throw deleteVinculosError;

      const { error: insertVinculosError } = await supabase
        .from("despesa_extraordinaria_unidades")
        .insert(unidadeIds.map((unidadeId) => ({ despesa_extraordinaria_id: data.id, unidade_id: unidadeId })));
      if (insertVinculosError) throw insertVinculosError;

      let cobrancasGeradas = 0;
      if (!isEditing) {
        // diferente da taxa de condomínio, o rateio extraordinário já emite as cobranças no cadastro
        const unidadesFaturaveis = unidadeIds.filter(
          (unidadeId) => unidades.find((u) => u.id === unidadeId)?.gera_cobranca,
        );

        if (unidadesFaturaveis.length > 0) {
          const { error: cobrancasError } = await supabase.from("cobrancas").insert(
            unidadesFaturaveis.map((unidadeId) => ({
              unidade_id: unidadeId,
              tipo: "extraordinaria" as const,
              descricao: data.titulo,
              competencia: data.data_vencimento,
              valor_usd: data.valor_por_unidade_usd,
              data_vencimento: data.data_vencimento,
              pct_multa_atraso: data.pct_multa_atraso,
              pct_juros_diario: data.pct_juros_diario,
              dias_graca: data.dias_graca,
              despesa_extraordinaria_id: data.id,
            })),
          );
          if (cobrancasError) throw cobrancasError;
          cobrancasGeradas = unidadesFaturaveis.length;
        }
      }

      onSaved({ ...data, unidade_ids: unidadeIds });
      toast.success(
        isEditing
          ? "Rateio extraordinário atualizado."
          : `Rateio extraordinário cadastrado e ${cobrancasGeradas} cobrança(s) gerada(s).`,
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar rateio extraordinário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? "Editar rateio extraordinário" : "Novo rateio extraordinário"}</DialogTitle>
        <DialogDescription>
          Despesa extraordinária (ex: reparo) rateada entre as unidades selecionadas. As regras
          abaixo são congeladas em cada cobrança gerada a partir deste rateio.
          {!isEditing &&
            " Ao salvar, uma cobrança já é emitida para cada unidade participante que gera cobrança."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="titulo">Título</Label>
          <Input
            id="titulo"
            placeholder="Ex: Reparo do telhado"
            required
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            placeholder="Detalhes do reparo ou despesa"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="valor_total_usd">Valor total (USD)</Label>
            <Input
              id="valor_total_usd"
              type="number"
              min="0"
              step="0.01"
              required
              value={valorTotalUsd}
              onChange={(e) => handleValorTotalChange(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="data_vencimento">Vencimento</Label>
            <Input
              id="data_vencimento"
              type="date"
              required
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="valor_por_unidade_usd">Valor por unidade (USD)</Label>
          <Input
            id="valor_por_unidade_usd"
            type="number"
            min="0"
            step="0.01"
            required
            value={valorPorUnidadeUsd}
            onChange={(e) => {
              setValorPorUnidadeTocado(true);
              setValorPorUnidadeUsd(e.target.value);
            }}
          />
          <span className="text-xs text-muted-foreground">
            Calculado automaticamente (valor total / unidades selecionadas), mas pode ser ajustado.
          </span>
        </div>

        <div className="grid gap-2">
          <Label>Unidades participantes</Label>
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-input p-3">
            {unidades.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
            ) : (
              unidades.map((unidade) => (
                <label
                  key={unidade.id}
                  htmlFor={`unidade-${unidade.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    id={`unidade-${unidade.id}`}
                    checked={unidadeIds.includes(unidade.id)}
                    onCheckedChange={(checked) => handleToggleUnidade(unidade.id, checked === true)}
                  />
                  {unidade.identificacao}
                  {!unidade.gera_cobranca && (
                    <span className="text-xs text-muted-foreground">(não gera cobrança)</span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pct_multa_atraso">Multa (%)</Label>
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
            <Label htmlFor="pct_juros_diario">Juros/dia (%)</Label>
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
            <Label htmlFor="dias_graca">Carência (dias)</Label>
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
