import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { UnidadesManager } from "@/components/admin/unidades/unidades-manager";
import type { Proprietario, Unidade } from "@/lib/types/unidades";
import {
  resolverFiltroSituacao,
  resolverOrdemUnidades,
  resumirSituacaoUnidades,
  type CobrancaPendenteDaUnidade,
} from "@/lib/listagem-unidades";

type UnidadeComContagem = Unidade & { cobrancas: { count: number }[] };

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ situacion?: string | string[]; orden?: string | string[]; propietario?: string | string[] }>;
}) {
  const { situacion, orden, propietario } = await searchParams;
  const supabase = await createClient();
  const t = await getTranslations("common");

  const [
    { data: unidades, error: unidadesError },
    { data: proprietarios, error: proprietariosError },
    { data: pendentes, error: pendentesError },
  ] = await Promise.all([
    // paginadas (buscarTodas): um condomínio grande pode passar das 1000 linhas por consulta da API.
    // cobrancas(count) diz se a unidade tem histórico (aí não pode ser excluída)
    buscarTodas((de, ate) =>
      supabase
        .from("unidades")
        .select("id, identificacao, proprietario_id, created_at, proprietario:proprietarios(id, nome), cobrancas(count)", {
          count: "exact",
        })
        .order("identificacao", { ascending: true })
        .order("id")
        .range(de, ate)
        .returns<UnidadeComContagem[]>(),
    ),
    buscarTodas((de, ate) =>
      supabase
        .from("proprietarios")
        .select("id, nome, documento_identidad, telefone_whatsapp, email", { count: "exact" })
        .order("nome", { ascending: true })
        .order("id")
        .range(de, ate)
        .returns<Proprietario[]>(),
    ),
    // situação de cada unidade: só as pendentes importam (multa e juros de hoje por lib/encargos)
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select(
          "unidade_id, valor_usd, valor_credito_abatido_usd, data_vencimento, dias_graca, pct_multa_atraso, pct_juros_diario, status, pagamento_cobrancas(valor_principal_abatido_usd)",
          { count: "exact" },
        )
        .eq("status", "pendente")
        .order("id")
        .range(de, ate)
        .returns<(Omit<CobrancaPendenteDaUnidade, "valor_principal_pago_usd"> & {
          pagamento_cobrancas: { valor_principal_abatido_usd: number }[];
        })[]>(),
    ),
  ]);

  const loadError = unidadesError ?? proprietariosError ?? pendentesError;
  if (loadError) {
    return <p className="text-sm text-destructive">{t("errorLoadingData", { message: loadError.message })}</p>;
  }

  const listaUnidades: Unidade[] = (unidades ?? []).map((u) => ({
    id: u.id,
    identificacao: u.identificacao,
    proprietario_id: u.proprietario_id,
    created_at: u.created_at,
    proprietario: u.proprietario,
  }));
  const cobrancasPorUnidade = Object.fromEntries(
    (unidades ?? []).map((u) => [u.id, u.cobrancas[0]?.count ?? 0]),
  );
  const situacoes = resumirSituacaoUnidades(
    listaUnidades.map((u) => u.id),
    (pendentes ?? []).map(({ pagamento_cobrancas, ...c }) => ({
      ...c,
      valor_principal_pago_usd: pagamento_cobrancas.reduce((acc, p) => acc + p.valor_principal_abatido_usd, 0),
    })),
    new Date(),
  );
  const propietarioInicial = typeof propietario === "string" ? propietario : null;

  return (
    <UnidadesManager
      unidades={listaUnidades}
      proprietarios={proprietarios ?? []}
      situacoes={situacoes}
      cobrancasPorUnidade={cobrancasPorUnidade}
      filtroInicial={resolverFiltroSituacao(situacion)}
      ordemInicial={resolverOrdemUnidades(orden)}
      proprietarioInicial={propietarioInicial}
    />
  );
}
