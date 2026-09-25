import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao } from "@/lib/types/creditos";
import { Button } from "@/components/ui/button";
import { UnidadeDetailTabs } from "@/components/admin/unidades/unidade-detail-tabs";

export default async function UnidadeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: unidade, error: unidadeError } = await supabase
    .from("unidades")
    .select(
      "id, identificacao, proprietario_id, created_at, proprietario:proprietarios(id, nome, documento_identidad, telefone_whatsapp, email)",
    )
    .eq("id", id)
    .maybeSingle<
      Omit<Unidade, "proprietario"> & {
        proprietario: {
          id: string;
          nome: string;
          documento_identidad: string;
          telefone_whatsapp: string | null;
          email: string | null;
        } | null;
      }
    >();

  if (unidadeError) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {unidadeError.message}</p>;
  }

  if (!unidade) {
    notFound();
  }

  const [{ data: cobrancas, error: cobrancasError }, { data: creditos, error: creditosError }] =
    await Promise.all([
      supabase
        .from("cobrancas")
        .select("id, tipo, descricao, competencia, valor_usd, valor_credito_abatido_usd, data_vencimento, status")
        .eq("unidade_id", id)
        .order("data_vencimento", { ascending: false })
        .returns<CobrancaDaUnidade[]>(),
      supabase
        .from("creditos_movimentacoes")
        .select("id, tipo, moeda, valor, valor_equivalente_usd, descricao, created_at")
        .eq("unidade_id", id)
        .order("created_at", { ascending: false })
        .returns<CreditoMovimentacao[]>(),
    ]);

  if (cobrancasError || creditosError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados: {cobrancasError?.message ?? creditosError?.message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
          nativeButton={false}
          render={<Link href="/unidades" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{unidade.identificacao}</h1>
          <p className="text-sm text-muted-foreground">
            {unidade.proprietario?.nome ?? "Sem proprietário"}
          </p>
        </div>
      </div>

      <UnidadeDetailTabs
        unidade={unidade}
        cobrancas={cobrancas ?? []}
        creditos={creditos ?? []}
      />
    </div>
  );
}
