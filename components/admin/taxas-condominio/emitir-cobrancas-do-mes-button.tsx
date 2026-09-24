"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type EmitirCobrancasDoMesButtonProps = {
  taxaId: string;
  competencia: string;
  dataVencimento: string;
  valorUsd: number;
  pctMultaAtraso: number;
  pctJurosDiario: number;
  diasGraca: number;
  unidades: { id: string; identificacao: string }[];
};

export function EmitirCobrancasDoMesButton({
  taxaId,
  competencia,
  dataVencimento,
  valorUsd,
  pctMultaAtraso,
  pctJurosDiario,
  diasGraca,
  unidades,
}: EmitirCobrancasDoMesButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmitir = async () => {
    const supabase = createClient();
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("cobrancas").insert(
        unidades.map((unidade) => ({
          unidade_id: unidade.id,
          tipo: "ordinaria" as const,
          descricao: "Taxa de condomínio",
          competencia,
          valor_usd: valorUsd,
          data_vencimento: dataVencimento,
          pct_multa_atraso: pctMultaAtraso,
          pct_juros_diario: pctJurosDiario,
          dias_graca: diasGraca,
          taxa_condominio_id: taxaId,
        })),
      );

      if (error) throw error;

      toast.success(`${unidades.length} cobrança(s) emitida(s) para este mês.`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir cobranças do mês.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Button onClick={handleEmitir} disabled={isSubmitting} className="self-start">
      {isSubmitting
        ? "Emitindo..."
        : `Emitir cobrança para ${unidades.length} unidade(s) pendente(s)`}
    </Button>
  );
}
