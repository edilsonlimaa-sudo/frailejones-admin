import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
import { organizarCobrancas, resolverFiltroCobrancas } from "@/lib/lista-cobrancas";
import { formatMes, mesAdjacente, parseMes } from "@/lib/mes";
import { resumirProgresso } from "@/lib/progresso-cobranca";
import { resolverAbaTaxa, vencimentoDaCompetencia } from "@/lib/taxas";
import { INTL_LOCALE } from "@/lib/intl-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaxaCondominioDetailTabs } from "@/components/admin/taxas-condominio/taxa-condominio-detail-tabs";
import { formatUsd } from "@/lib/moeda";

type UnidadeResumida = { id: string; identificacao: string; proprietario: { nome: string } | null };

type CobrancaDoMesRow = CobrancaDetalhadaRow & { unidade: UnidadeResumida | null };

export default async function TaxaCondominioDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string; aba?: string | string[]; filtro?: string | string[] }>;
}) {
  const { id } = await params;
  const { mes: mesParam, aba, filtro } = await searchParams;
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
  const mesSelecionado = formatMes(ano, mes);
  const competencia = `${mesSelecionado}-01`;
  const dataVencimento = vencimentoDaCompetencia(taxa.dia_vencimento, mesSelecionado);
  const mesAnterior = mesAdjacente(ano, mes, -1);
  const mesSeguinte = mesAdjacente(ano, mes, 1);
  const mesLabel = mesLabelFormatter.format(new Date(`${competencia}T00:00:00Z`));
  const mesLabelCapitalizado = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

  // listas que crescem com o condomínio (unidades, vínculos, cobranças do mês): paginadas
  const [
    { data: todasUnidades, error: todasUnidadesError },
    { data: vinculosRaw, error: vinculosError },
    { data: cobrancasRaw, error: cobrancasError },
    { data: faturamento, error: faturamentoError },
    { data: cotacoes, error: cotacaoBcvError },
  ] = await Promise.all([
    buscarTodas((de, ate) =>
      supabase
        .from("unidades")
        .select("id, identificacao, proprietario:proprietarios(id, nome)", { count: "exact" })
        .order("identificacao", { ascending: true })
        .order("id")
        .range(de, ate)
        .returns<{ id: string; identificacao: string; proprietario: { id: string; nome: string } | null }[]>(),
    ),
    buscarTodas((de, ate) =>
      supabase
        .from("taxa_condominio_unidades")
        .select("unidade:unidades(id, identificacao, proprietario:proprietarios(nome))", { count: "exact" })
        .eq("taxa_condominio_id", id)
        .order("id")
        .range(de, ate)
        .returns<{ unidade: UnidadeResumida | null }[]>(),
    ),
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select(`${SELECT_COBRANCA_DETALHADA}, unidade:unidades(id, identificacao, proprietario:proprietarios(nome))`, {
          count: "exact",
        })
        .eq("taxa_condominio_id", id)
        .eq("competencia", competencia)
        .order("id")
        .range(de, ate)
        .returns<CobrancaDoMesRow[]>(),
    ),
    supabase
      .from("faturamentos_competencia")
      .select("id, data_processamento")
      .eq("taxa_condominio_id", id)
      .eq("competencia", competencia)
      .maybeSingle<{ id: string; data_processamento: string }>(),
    supabase
      .from("cotacao_bcv")
      .select("id, data_cotacao, tasa_ves")
      .order("data_cotacao", { ascending: false })
      .limit(366)
      .returns<{ id: string; data_cotacao: string; tasa_ves: number }[]>(),
  ]);

  const loadError = todasUnidadesError ?? vinculosError ?? cobrancasError ?? faturamentoError ?? cotacaoBcvError;
  if (loadError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: loadError.message })}</p>;
  }

  const linhas = cobrancasRaw ?? [];
  const unidadesComCobranca = new Set(linhas.map((c) => c.unidade?.id));
  const unidadesVinculadas = (vinculosRaw ?? [])
    .map((v) => v.unidade)
    .filter((u): u is UnidadeResumida => u !== null)
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao));

  // competência já processada: o escopo trava em quem foi de fato faturado naquele momento, pra
  // unidades vinculadas depois não aparecerem como "não emitidas" num mês que já fechou
  const competenciaFaturada = faturamento != null;
  const naoEmitidas = competenciaFaturada
    ? []
    : unidadesVinculadas
        .filter((u) => !unidadesComCobranca.has(u.id))
        .map((u) => ({ id: u.id, identificacao: u.identificacao }));

  const agora = new Date();
  const cobrancas = linhas.map(montarCobrancaDetalhada);
  const unidadePorCobranca = new Map(linhas.map((c) => [c.id, c.unidade]));
  const organizadas = organizarCobrancas(cobrancas, agora, {
    agruparPorMes: false,
    // cada linha é uma unidade (com o dono e link pra aba de cobranças dela)
    rotulo: (c) => {
      const unidade = unidadePorCobranca.get(c.id);
      return {
        titulo: unidade?.identificacao ?? "—",
        subtitulo: unidade?.proprietario?.nome ?? null,
        href: unidade ? `/unidades/${unidade.id}?aba=cobrancas` : null,
        extraordinaria: false,
      };
    },
  });
  const pagas = organizadas.historial.flatMap((g) => g.itens);

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
        abaInicial={resolverAbaTaxa(aba)}
        filtroInicial={resolverFiltroCobrancas(filtro)}
        taxa={taxa}
        mes={{
          label: mesLabelCapitalizado,
          competencia,
          dataVencimento,
          anteriorHref: `/taxas-condominio/${id}?mes=${formatMes(mesAnterior.ano, mesAnterior.mes)}`,
          seguinteHref: `/taxas-condominio/${id}?mes=${formatMes(mesSeguinte.ano, mesSeguinte.mes)}`,
        }}
        organizadas={organizadas}
        resumo={resumirProgresso(cobrancas, agora.toISOString().slice(0, 10))}
        pagasEmDia={pagas.filter((i) => i.estado === "enDia").length}
        pagasComAtraso={pagas.filter((i) => i.estado === "conAtraso").length}
        naoEmitidas={naoEmitidas}
        competenciaFaturada={competenciaFaturada}
        dataProcessamento={faturamento?.data_processamento ?? null}
        todasUnidades={todasUnidades ?? []}
        unidadesVinculadasIds={unidadesVinculadas.map((u) => u.id)}
        cotacoes={cotacoes ?? []}
      />
    </div>
  );
}
