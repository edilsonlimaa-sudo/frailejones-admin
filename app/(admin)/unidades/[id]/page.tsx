import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";
import { createClient } from "@/lib/supabase/server";
import type { Unidade } from "@/lib/types/unidades";
import type { AcordoPagamento } from "@/lib/types/acordos";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, CreditoOrigemCobranca } from "@/lib/types/creditos";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
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
    { data: acordos, error: acordosError },
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
    garantirCotacaoBcvAtualizada().then(() =>
      supabase
        .from("cotacao_bcv")
        .select("id, data_cotacao, tasa_ves")
        .order("data_cotacao", { ascending: false })
        .limit(366)
        .returns<{ id: string; data_cotacao: string; tasa_ves: number }[]>(),
    ),
    supabase
      .from("acordos_pagamento")
      .select("id, unidade_id, data_inicio, observacao, quebrado_em, created_at")
      .eq("unidade_id", id)
      .order("data_inicio", { ascending: false })
      .returns<AcordoPagamento[]>(),
  ]);

  if (cobrancasError || creditosError || cotacaoBcvError || acordosError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", {
          message:
            cobrancasError?.message ??
            creditosError?.message ??
            cotacaoBcvError?.message ??
            acordosError?.message ??
            "",
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

  // a barra fixa com a volta, a identificação e as abas fica dentro de UnidadeDetailTabs
  return (
    <UnidadeDetailTabs
      abaInicial={aba}
      filtroInicial={filtro}
      unidade={unidade}
      cobrancas={cobrancas}
      creditos={creditos}
      acordos={acordos ?? []}
      cotacoes={cotacoes ?? []}
    />
  );
}
