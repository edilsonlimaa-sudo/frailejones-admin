import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";
import type { UnidadeCobrancaDoMes } from "@/lib/types/cobrancas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaxaCondominioDetailTabs } from "@/components/admin/taxas-condominio/taxa-condominio-detail-tabs";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const mesLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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
  status: "pendente" | "pago" | "cancelado";
  unidade: { id: string; identificacao: string } | null;
  pagamento_cobrancas: { valor_principal_abatido_usd: number; valor_juros_pago_usd: number }[];
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

  const { data: taxa, error: taxaError } = await supabase
    .from("taxa_condominio")
    .select(
      "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at",
    )
    .eq("id", id)
    .maybeSingle<TaxaCondominio>();

  if (taxaError) {
    return <p className="text-sm text-destructive">Erro ao carregar dados: {taxaError.message}</p>;
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
      .select("unidade:unidades(id, identificacao)")
      .eq("taxa_condominio_id", id)
      .returns<{ unidade: { id: string; identificacao: string } | null }[]>(),
    supabase
      .from("cobrancas")
      .select(
        "id, valor_usd, valor_credito_abatido_usd, data_vencimento, status, unidade:unidades(id, identificacao), pagamento_cobrancas(valor_principal_abatido_usd, valor_juros_pago_usd)",
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
  ]);

  if (todasUnidadesError || vinculosError || cobrancasError || faturamentoError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados:{" "}
        {todasUnidadesError?.message ?? vinculosError?.message ?? cobrancasError?.message ?? faturamentoError?.message}
      </p>
    );
  }

  const unidadesVinculadas = (vinculosRaw ?? [])
    .map((v) => v.unidade)
    .filter((u): u is { id: string; identificacao: string } => u !== null)
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao));

  const cobrancasPorUnidade = new Map((cobrancasRaw ?? []).map((c) => [c.unidade?.id, c]));

  // competência já processada: o escopo trava em quem foi de fato faturado naquele
  // momento (via cobrancasRaw), pra unidades vinculadas depois não aparecerem como pendentes
  const competenciaFaturada = faturamento != null;
  const unidadesEscopo = competenciaFaturada
    ? (cobrancasRaw ?? [])
        .map((c) => c.unidade)
        .filter((u): u is { id: string; identificacao: string } => u !== null)
        .sort((a, b) => a.identificacao.localeCompare(b.identificacao))
    : unidadesVinculadas;

  const unidadesDoMes: UnidadeCobrancaDoMes[] = unidadesEscopo.map((unidade) => {
    const cobranca = cobrancasPorUnidade.get(unidade.id);
    return {
      unidade_id: unidade.id,
      unidade_identificacao: unidade.identificacao,
      cobranca: cobranca
        ? {
            id: cobranca.id,
            valor_usd: cobranca.valor_usd,
            valor_credito_abatido_usd: cobranca.valor_credito_abatido_usd,
            data_vencimento: cobranca.data_vencimento,
            status: cobranca.status,
            valor_principal_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_principal_abatido_usd,
              0,
            ),
            valor_juros_pago_usd: cobranca.pagamento_cobrancas.reduce(
              (acc, p) => acc + p.valor_juros_pago_usd,
              0,
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
          aria-label="Voltar"
          nativeButton={false}
          render={<Link href="/taxas-condominio" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-lg font-medium">{taxa.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {currencyFormatter.format(taxa.valor_usd)} · vencimento todo dia {taxa.dia_vencimento}
          </p>
        </div>
        <Badge variant={taxa.ativo ? "default" : "outline"} className="ml-auto">
          {taxa.ativo ? "Ativa" : "Inativa"}
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
      />
    </div>
  );
}
