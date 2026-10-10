import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, CreditoOrigemCobranca } from "@/lib/types/creditos";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
import { Button } from "@/components/ui/button";
import { UnidadeDetailTabs } from "@/components/admin/unidades/unidade-detail-tabs";
import { resolverAbaUnidade } from "@/lib/abas-unidade";
import { resolverFiltroCobrancas } from "@/lib/lista-cobrancas";

// pagamento_cobrancas.pagamento_id é UNIQUE, então o embed reverso (a partir de pagamentos)
// vem como objeto único (ou null), não array
type CreditoRow = Omit<CreditoMovimentacao, "pagamento"> & {
  pagamento:
    | {
        id: string;
        data_pagamento: string;
        pagamento_cobrancas: { cobranca: CreditoOrigemCobranca | null } | null;
      }
    | null;
};

export default async function UnidadeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[]; filtro?: string | string[] }>;
}) {
  const { id } = await params;
  const { aba: abaParam, filtro: filtroParam } = await searchParams;
  const aba = resolverAbaUnidade(abaParam);
  const filtro = resolverFiltroCobrancas(filtroParam);
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tUnidades = await getTranslations("unidades");

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
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: unidadeError.message })}</p>;
  }

  if (!unidade) {
    notFound();
  }

  const [
    { data: cobrancasRaw, error: cobrancasError },
    { data: creditosRaw, error: creditosError },
    { data: cotacoes, error: cotacaoBcvError },
  ] = await Promise.all([
    supabase
      .from("cobrancas")
      .select(SELECT_COBRANCA_DETALHADA)
      .eq("unidade_id", id)
      .order("data_vencimento", { ascending: false })
      .returns<CobrancaDetalhadaRow[]>(),
    supabase
      .from("creditos_movimentacoes")
      .select(
        "id, tipo, moeda, valor, descricao, created_at, cobranca:cobrancas(id, descricao, competencia), pagamento:pagamentos(id, data_pagamento, pagamento_cobrancas(cobranca:cobrancas(id, descricao, competencia)))",
      )
      .eq("unidade_id", id)
      .order("created_at", { ascending: false })
      .returns<CreditoRow[]>(),
    supabase
      .from("cotacao_bcv")
      .select("id, data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<{ id: string; data_cotacao: string; tasa_ves: number }[]>(),
  ]);

  if (cobrancasError || creditosError || cotacaoBcvError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", {
          message: cobrancasError?.message ?? creditosError?.message ?? cotacaoBcvError?.message ?? "",
        })}
      </p>
    );
  }

  const creditos: CreditoMovimentacao[] = (creditosRaw ?? []).map(({ pagamento, ...credito }) => ({
    ...credito,
    pagamento: pagamento
      ? {
          id: pagamento.id,
          data_pagamento: pagamento.data_pagamento,
          cobranca: pagamento.pagamento_cobrancas?.cobranca ?? null,
        }
      : null,
  }));

  const cobrancas: CobrancaDaUnidade[] = (cobrancasRaw ?? []).map(montarCobrancaDetalhada);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/unidades" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{unidade.identificacao}</h1>
          <p className="text-sm text-muted-foreground">
            {unidade.proprietario?.nome ?? tUnidades("noOwnerAssigned")}
          </p>
        </div>
      </div>

      <UnidadeDetailTabs
        abaInicial={aba}
        filtroInicial={filtro}
        unidade={unidade}
        cobrancas={cobrancas}
        creditos={creditos}
        cotacoes={cotacoes ?? []}
      />
    </div>
  );
}
