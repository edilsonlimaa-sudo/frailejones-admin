import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { TaxasCondominioManager, type SituacaoTaxa } from "@/components/admin/taxas-condominio/taxas-condominio-manager";
import {
  montarCobrancaDetalhada,
  SELECT_COBRANCA_DETALHADA,
  type CobrancaDetalhadaRow,
} from "@/lib/cobrancas-detalhadas";
import { classificarCobranca } from "@/lib/estado-de-cuenta";
import { resumirProgresso } from "@/lib/progresso-cobranca";
import { mesAtualCaracas, taxasSemEmissaoNoMes } from "@/lib/taxas";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";

type TaxaRow = TaxaCondominio & {
  taxa_condominio_unidades: { count: number }[];
  // com cobranças, a cuota não pode ser excluída (só desativada)
  cobrancas: { count: number }[];
  faturamentos_competencia: { competencia: string }[];
};

export default async function TaxasCondominioPage() {
  const supabase = await createClient();
  const t = await getTranslations("common");

  const { data: taxas, error } = await supabase
    .from("taxa_condominio")
    .select(
      "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, ativo, created_at, taxa_condominio_unidades(count), cobrancas(count), faturamentos_competencia(competencia)",
    )
    .order("ativo", { ascending: false })
    .order("titulo", { ascending: true })
    .returns<TaxaRow[]>();

  if (error) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: error.message })}</p>;
  }

  const agora = new Date();
  const mesAtual = mesAtualCaracas(agora);
  const linhas = taxas ?? [];

  // mês de referência de cada cuota: o atual se já foi emitido, senão o último emitido
  const referencia = new Map(
    linhas.map((taxa) => {
      const emitidas = taxa.faturamentos_competencia.map((f) => f.competencia).sort();
      return [taxa.id, emitidas.at(-1) ?? null] as const;
    }),
  );
  const competencias = [...new Set([...referencia.values()].filter((c): c is string => c !== null))];

  const { data: cobrancasRaw, error: cobrancasError } =
    competencias.length > 0
      ? await buscarTodas((de, ate) =>
          supabase
            .from("cobrancas")
            .select(`${SELECT_COBRANCA_DETALHADA}, taxa_condominio_id`, { count: "exact" })
            .in("taxa_condominio_id", linhas.map((taxa) => taxa.id))
            .in("competencia", competencias)
            .order("id")
            .range(de, ate)
            .returns<(CobrancaDetalhadaRow & { taxa_condominio_id: string })[]>(),
        )
      : { data: [], error: null };

  if (cobrancasError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: cobrancasError.message })}</p>;
  }

  const hojeIso = agora.toISOString().slice(0, 10);
  const situacoes: Record<string, SituacaoTaxa> = Object.fromEntries(
    linhas.map((taxa) => {
      const mesReferencia = referencia.get(taxa.id) ?? null;
      const cobrancas = (cobrancasRaw ?? [])
        .filter((c) => c.taxa_condominio_id === taxa.id && c.competencia === mesReferencia)
        .map(montarCobrancaDetalhada);
      const estados = cobrancas.map((c) => classificarCobranca(c, hojeIso).estado);
      return [
        taxa.id,
        {
          unidadesVinculadas: taxa.taxa_condominio_unidades[0]?.count ?? 0,
          temCobrancas: (taxa.cobrancas[0]?.count ?? 0) > 0,
          mesAtualEmitido: taxa.faturamentos_competencia.some((f) => f.competencia === `${mesAtual}-01`),
          referencia: mesReferencia
            ? {
                mes: mesReferencia.slice(0, 7),
                resumo: resumirProgresso(cobrancas, hojeIso),
                emDia: estados.filter((e) => e === "enDia").length,
                comAtraso: estados.filter((e) => e === "conAtraso").length,
              }
            : null,
        },
      ];
    }),
  );

  const semEmissao = taxasSemEmissaoNoMes(
    linhas.map((taxa) => ({
      id: taxa.id,
      titulo: taxa.titulo,
      ativo: taxa.ativo,
      unidadesVinculadas: taxa.taxa_condominio_unidades[0]?.count ?? 0,
      competenciasEmitidas: taxa.faturamentos_competencia.map((f) => f.competencia),
    })),
    mesAtual,
  );

  return (
    <TaxasCondominioManager
      taxas={linhas.map((taxa) => ({
        id: taxa.id,
        titulo: taxa.titulo,
        valor_usd: taxa.valor_usd,
        dia_vencimento: taxa.dia_vencimento,
        pct_multa_atraso: taxa.pct_multa_atraso,
        pct_juros_diario: taxa.pct_juros_diario,
        dias_graca: taxa.dias_graca,
        ativo: taxa.ativo,
        created_at: taxa.created_at,
      }))}
      situacoes={situacoes}
      mesAtual={mesAtual}
      semEmissaoIds={semEmissao.map((taxa) => taxa.id)}
    />
  );
}
