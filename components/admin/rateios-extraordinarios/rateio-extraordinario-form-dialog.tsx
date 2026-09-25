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
        setError("Preencha os campos obrigatórios antes de continuar.");
        return;
      }
      setError(null);
      setStep(2);
      return;
    }

    if (unidadeIds.length === 0) {
      setError("Selecione ao menos uma unidade participante.");
      return;
    }

    // rateio: valor por unidade é sempre derivado do valor total / quantidade de unidades selecionadas
    const valorPorUnidadeUsd = Number((Number(valorTotalUsd) / unidadeIds.length).toFixed(2));

    const supabase = createClient();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        valor_total_usd: Number(valorTotalUsd),
        valor_por_unidade_usd: valorPorUnidadeUsd,
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
        // diferente da taxa de condomínio, o rateio extraordinário já emite as cobranças no cadastro,
        // uma para cada unidade participante selecionada
        const { error: cobrancasError } = await supabase.from("cobrancas").insert(
          unidadeIds.map((unidadeId) => ({
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
        cobrancasGeradas = unidadeIds.length;
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
        <DialogTitle>
          {isEditing ? "Editar rateio extraordinário" : "Novo rateio extraordinário"}
          {" — "}
          {step === 1 ? "passo 1 de 2: dados do rateio" : "passo 2 de 2: unidades participantes"}
        </DialogTitle>
        <DialogDescription>
          {step === 1 ? (
            <>
              Despesa extraordinária (ex: reparo) rateada entre as unidades selecionadas. As regras
              abaixo são congeladas em cada cobrança gerada a partir deste rateio.
            </>
          ) : (
            <>
              Escolha as unidades que vão participar deste rateio.
              {!isEditing &&
                " Nada é salvo até você confirmar no passo final — ao salvar, uma cobrança já é emitida para cada unidade selecionada."}
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
                    onChange={(e) => setValorTotalUsd(e.target.value)}
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
            </>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Unidades participantes</Label>
                <span className="text-xs text-muted-foreground">
                  {unidadeIds.length} de {unidades.length} selecionada(s)
                </span>
              </div>
              {unidades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</p>
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
                    Selecionar todas
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
                            {unidade.proprietario?.nome ?? "Sem proprietário"}
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
              Voltar
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {step === 1 ? "Próximo" : isSubmitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
