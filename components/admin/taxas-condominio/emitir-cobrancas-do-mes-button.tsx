"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { formatUsd } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type EmitirCobrancasDoMesButtonProps = {
  taxaId: string;
  competencia: string;
  dataVencimento: string;
  valorUsd: number;
  pctMultaAtraso: number;
  pctJurosDiario: number;
  diasGraca: number;
  unidades: { id: string; identificacao: string }[];
  // "Octubre de 2026", pro título da confirmação
  mesLabel: string;
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
  mesLabel,
  className,
}: EmitirCobrancasDoMesButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const t = useTranslations("emitirCobrancasDoMes");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

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

  // confirmação antes de emitir: num condomínio grande são centenas de cobranças de uma vez, com as
  // regras congeladas, e a competência fica fechada (não dá pra desfazer pela tela)
  return (
    <AlertDialog open={confirmando} onOpenChange={(aberto) => !isSubmitting && setConfirmando(aberto)}>
      <Button onClick={() => setConfirmando(true)} disabled={isSubmitting} className={cn("self-start", className)}>
        {isSubmitting ? t("submitting") : t("trigger")}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle", { month: mesLabel })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmDescription", {
              count: unidades.length,
              value: formatUsd(valorUsd),
              total: formatUsd(valorUsd * unidades.length),
              date: formatDate(dataVencimento),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={async () => {
              await handleEmitir();
              setConfirmando(false);
            }}
          >
            {isSubmitting ? t("submitting") : t("confirmAction", { count: unidades.length })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
