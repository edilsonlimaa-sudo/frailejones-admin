import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { Unidade } from "@/lib/types/unidades";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";
import type { CreditoMovimentacao, CreditoOrigemCobranca, MoedaTipo } from "@/lib/types/creditos";
import type { PagamentoDaCobranca } from "@/lib/types/pagamentos";
import { Button } from "@/components/ui/button";
import { UnidadeDetailTabs } from "@/components/admin/unidades/unidade-detail-tabs";

type CobrancaRow = Omit<
  CobrancaDaUnidade,
  "valor_principal_pago_usd" | "valor_juros_pago_usd" | "data_ultimo_pagamento" | "pagamentos"
> & {
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento:
      | (Omit<PagamentoDaCobranca, "valor_principal_abatido_usd" | "valor_juros_pago_usd" | "creditoGeradoUsd"> & {
          creditos_movimentacoes: { valor: number; moeda: MoedaTipo }[];
        })
      | null;
  }[];
};

type CreditoRow = Omit<CreditoMovimentacao, "pagamento"> & {
  pagamento:
    | {
        id: string;
        data_pagamento: string;
        pagamento_cobrancas: { cobranca: CreditoOrigemCobranca | null }[];
      }
    | null;
};

export default async function UnidadeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      .select(
        "id, tipo, descricao, competencia, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(id, data_pagamento, moeda, valor_recebido, valor_equivalente_usd, tasa_bcv_aplicada, forma_pagamento, referencia_bancaria, observacao, creditos_movimentacoes(valor, moeda)))",
      )
      .eq("unidade_id", id)
      .order("data_vencimento", { ascending: false })
      .returns<CobrancaRow[]>(),
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
          cobranca: pagamento.pagamento_cobrancas[0]?.cobranca ?? null,
        }
      : null,
  }));

  const cobrancas: CobrancaDaUnidade[] = (cobrancasRaw ?? []).map(
    ({ pagamento_cobrancas, ...cobranca }) => ({
      ...cobranca,
      valor_principal_pago_usd: pagamento_cobrancas.reduce(
        (acc, p) => acc + p.valor_principal_abatido_usd,
        0,
      ),
      valor_juros_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_juros_pago_usd, 0),
      // data do pagamento mais recente que liquidou esta cobrança, pra congelar o Bs. exibido nessa data
      data_ultimo_pagamento: pagamento_cobrancas.reduce<string | null>(
        (latest, p) =>
          p.pagamento && (!latest || p.pagamento.data_pagamento > latest)
            ? p.pagamento.data_pagamento
            : latest,
        null,
      ),
      pagamentos: pagamento_cobrancas
        .filter((p) => p.pagamento !== null)
        .map((p) => {
          const { creditos_movimentacoes, ...pagamento } = p.pagamento!;
          // sobra convertida na mesma tasa congelada do pagamento que a gerou (fato histórico,
          // não o saldo disponível hoje, que é revalorizado à parte com a cotação atual)
          const creditoGeradoUsd = creditos_movimentacoes.reduce(
            (acc, c) =>
              acc + (c.moeda === "VES" && pagamento.tasa_bcv_aplicada ? c.valor / pagamento.tasa_bcv_aplicada : c.valor),
            0,
          );
          return {
            ...pagamento,
            valor_principal_abatido_usd: p.valor_principal_abatido_usd,
            valor_juros_pago_usd: p.valor_juros_pago_usd,
            creditoGeradoUsd,
          };
        }),
    }),
  );

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
        unidade={unidade}
        cobrancas={cobrancas}
        creditos={creditos}
        cotacoes={cotacoes ?? []}
      />
    </div>
  );
}
