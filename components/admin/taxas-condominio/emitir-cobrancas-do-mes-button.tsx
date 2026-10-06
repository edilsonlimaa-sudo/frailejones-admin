"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
  className?: string;
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
  className,
}: EmitirCobrancasDoMesButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("emitirCobrancasDoMes");

  const handleEmitir = async () => {
    const supabase = createClient();
    setIsSubmitting(true);

    try {
      // emite as cobranças, aplica o saldo a favor de cada unidade e fecha a competência numa
      // única transação (ver emitir_cobrancas_taxa na migration): ou emite tudo, ou nada
      const { error } = await supabase.rpc("emitir_cobrancas_taxa", {
        p_taxa_condominio_id: taxaId,
        p_competencia: competencia,
        p_data_vencimento: dataVencimento,
        p_valor_usd: valorUsd,
        p_pct_multa_atraso: pctMultaAtraso,
        p_pct_juros_diario: pctJurosDiario,
        p_dias_graca: diasGraca,
        p_unidade_ids: unidades.map((unidade) => unidade.id),
      });

      if (error) throw error;

      toast.success(t("successMessage", { count: unidades.length }));
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("errorMessage"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Button onClick={handleEmitir} disabled={isSubmitting} className={cn("self-start", className)}>
      {isSubmitting ? t("submitting") : t("trigger")}
    </Button>
  );
}
