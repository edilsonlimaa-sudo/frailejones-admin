import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaxaCondominioDetailTabs } from "@/components/admin/taxas-condominio/taxa-condominio-detail-tabs";
import { formatUsd } from "@/lib/moeda";

function parseMes(mes: string | undefined) {
  const hoje = new Date();
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNumero] = mes.split("-").map(Number);
    return { ano, mes: mesNumero };
  }
  return { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() + 1 };
}

function formatMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function mesAdjacente(ano: number, mes: number, delta: number) {
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1 };
}

function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

type CobrancaRow = {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  dias_graca: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  status: "pendente" | "pago" | "cancelado";
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  pagamento_cobrancas: {
    valor_principal_abatido_usd: number;
    valor_juros_pago_usd: number;
    pagamento: { data_pagamento: string } | null;
  }[];
};

export default async function TaxaCondominioDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("common");
  const tTaxa = await getTranslations("taxaCondominioDetail");
  const locale = await getLocale();
  const intlLocale = INTL_LOCALE[locale as keyof typeof INTL_LOCALE];
  const mesLabelFormatter = new Intl.DateTimeFormat(intlLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const { data: taxa, error: taxaError } = await supabase
    .from("taxa_condominio")
    .select(
      "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at",
    )
    .eq("id", id)
    .maybeSingle<TaxaCondominio>();

  if (taxaError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: taxaError.message })}</p>;
  }

  if (!taxa) {
    notFound();
  }

  const { ano, mes } = parseMes(mesParam);
  const competencia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const diaVencimento = Math.min(taxa.dia_vencimento, ultimoDiaDoMes(ano, mes));
  const dataVencimento = `${ano}-${String(mes).padStart(2, "0")}-${String(diaVencimento).padStart(2, "0")}`;
  const mesAnterior = mesAdjacente(ano, mes, -1);
  const mesSeguinte = mesAdjacente(ano, mes, 1);
  const mesLabel = mesLabelFormatter.format(new Date(`${competencia}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  const [
    { data: todasUnidades, error: todasUnidadesError },
    { data: vinculosRaw, error: vinculosError },
    { data: cobrancasRaw, error: cobrancasError },
    { data: faturamento, error: faturamentoError },
    { data: cotacoes, error: cotacaoBcvError },
  ] = await Promise.all([
    supabase
      .from("unidades")
      .select("id, identificacao, proprietario:proprietarios(id, nome)")
      .order("identificacao", { ascending: true })
      .returns<
        { id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[]
      >(),
    supabase
      .from("taxa_condominio_unidades")
      .select("unidade:unidades(id, identificacao, proprietario:proprietarios(nome))")
      .eq("taxa_condominio_id", id)
      .returns<
        { unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null }[]
      >(),
    supabase
      .from("cobrancas")
      .select(
        "id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, unidade:unidades(id, identificacao, proprietario:proprietarios(nome)), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd, pagamento:pagamentos(data_pagamento))",
      )
      .eq("taxa_condominio_id", id)
      .eq("competencia", competencia)
      .returns<CobrancaRow[]>(),
    supabase
      .from("faturamentos_competencia")
      .select("id, data_processamento")
      .eq("taxa_condominio_id", id)
      .eq("competencia", competencia)
      .maybeSingle<{ id: string; data_processamento: string }>(),
    supabase
      .from("cotacao_bcv")
      .select("data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<{ data_cotacao: string; tasa_ves: number }[]>(),
  ]);

  if (todasUnidadesError || vinculosError || cobrancasError || faturamentoError || cotacaoBcvError) {
    return (
      <p className="text-sm text-destructive">
        {t("errorLoadingData", {
          message:
            todasUnidadesError?.message ??
            vinculosError?.message ??
            cobrancasError?.message ??
            faturamentoError?.message ??
            cotacaoBcvError?.message ??
            "",
        })}
      </p>
    );
  }

  const unidadesVinculadas = (vinculosRaw ?? [])
    .map((v) => v.unidade)
    .filter(
      (u): u is { id: string; identificacao: string; proprietario: { nome: string } | null } => u !== null,
    )
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao));

  const cobrancasPorUnidade = new Map((cobrancasRaw ?? []).map((c) => [c.unidade?.id, c]));

  // competência já processada: o escopo trava em quem foi de fato faturado naquele
  // momento (via cobrancasRaw), pra unidades vinculadas depois não aparecerem como pendentes
  const competenciaFaturada = faturamento != null;
  const unidadesEscopo = competenciaFaturada
    ? (cobrancasRaw ?? [])
        .map((c) => c.unidade)
        .filter(
          (u): u is { id: string; identificacao: string; proprietario: { nome: string } | null } => u !== null,
        )
        .sort((a, b) => a.identificacao.localeCompare(b.identificacao))
    : unidadesVinculadas;

  const unidadesDoMes: UnidadeCobrancaDoMes[] = unidadesEscopo.map((unidade) => {
    const cobranca = cobrancasPorUnidade.get(unidade.id);
    return {
      unidade_id: unidade.id,
      unidade_identificacao: unidade.identificacao,
      unidade_proprietario_nome: unidade.proprietario?.nome ?? null,
      cobranca: cobranca
        ? {
            id: cobranca.id,
            valor_usd: cobranca.valor_usd,
            valor_credito_abatido_usd: cobranca.valor_credito_abatido_usd,
            data_vencimento: cobranca.data_vencimento,
            dias_graca: cobranca.dias_graca,
            pct_multa_atraso: cobranca.pct_multa_atraso,
            pct_juros_diario: cobranca.pct_juros_diario,
            status: cobranca.status,
            valor_principal_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_principal_abatido_usd,
              0,
            ),
            valor_juros_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_juros_pago_usd,
              0,
            ),
            data_ultimo_pagamento: cobranca.pagamento_cobrancas.reduce<string | null>(
              (latest, p) =>
                p.pagamento && (!latest || p.pagamento.data_pagamento > latest)
                  ? p.pagamento.data_pagamento
                  : latest,
              null,
            ),
          }
        : null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("back")}
          nativeButton={false}
          render={<Link href="/taxas-condominio" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{taxa.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {tTaxa("headerSubtitle", { value: formatUsd(taxa.valor_usd), day: taxa.dia_vencimento })}
          </p>
        </div>
        <Badge variant={taxa.ativo ? "default" : "outline"} className="ml-auto">
          {taxa.ativo ? tTaxa("activeFeminine") : tTaxa("inactiveFeminine")}
        </Badge>
      </div>

      <TaxaCondominioDetailTabs
        taxaId={taxa.id}
        valorUsd={taxa.valor_usd}
        pctMultaAtraso={taxa.pct_multa_atraso}
        pctJurosDiario={taxa.pct_juros_diario}
        diasGraca={taxa.dias_graca}
        competencia={competencia}
        dataVencimento={dataVencimento}
        mesLabelCapitalizado={mesLabelCapitalizado}
        mesAnteriorHref={`/taxas-condominio/${id}?mes=${formatMes(mesAnterior.ano, mesAnterior.mes)}`}
        mesSeguinteHref={`/taxas-condominio/${id}?mes=${formatMes(mesSeguinte.ano, mesSeguinte.mes)}`}
        unidadesDoMes={unidadesDoMes}
        todasUnidades={todasUnidades ?? []}
        unidadesVinculadasIds={unidadesVinculadas.map((u) => u.id)}
        competenciaFaturada={competenciaFaturada}
        dataProcessamento={faturamento?.data_processamento ?? null}
        cotacoes={cotacoes ?? []}
      />
    </div>
  );
}
