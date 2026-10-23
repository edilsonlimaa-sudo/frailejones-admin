import { NonRetriableError, StepError, cron } from "inngest";

import { paramsRegrasEncargos } from "@/lib/encargos";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarTodas } from "@/lib/supabase/buscar-todas";
import { mesAtualCaracas, taxasSemEmissaoNoMes, vencimentoDaCompetencia } from "@/lib/taxas";
import type { TaxaCondominio } from "@/lib/types/taxas-condominio";

// Emissão mensal das cuotas pelo Inngest: todo dia 1 (Caracas) emite as cobranças do mês de cada
// cuota ativa, com unidades vinculadas, cuja competência ainda não foi fechada. É o que o botão
// "Emitir cobranças do mês" faz na tela da cuota, com a mesma função SQL (emitir_cobrancas_taxa):
// emite pra todas as unidades vinculadas, aplica o saldo a favor e fecha a competência numa
// transação só. Idempotente: competência fechada é pulada, então rodar de novo não duplica nada.
//
// Cada cuota é um step próprio: se uma falhar depois das tentativas, as outras são emitidas mesmo
// assim e a execução termina como falha, com o motivo, pra aparecer no painel do Inngest.

const SELECT_TAXA =
  "id, titulo, valor_usd, dia_vencimento, pct_multa_atraso, pct_juros_diario, dias_graca, metodo_encargos, pct_juros_mensal, criterio_mes, ativo, created_at";

type TaxaRow = TaxaCondominio & {
  taxa_condominio_unidades: { count: number }[];
  faturamentos_competencia: { competencia: string }[];
};

type ResultadoEmissao = {
  taxaId: string;
  titulo: string;
  emitidas: number;
  // nada emitido e não é falha: a competência já estava fechada ou não havia unidade a cobrar
  pulada: string | null;
};

// cuotas que deveriam ter cobrança no mês e ainda não têm (mesmo critério do aviso na listagem)
async function listarCuotasPendentes(mes: string): Promise<TaxaCondominio[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("taxa_condominio")
    .select(`${SELECT_TAXA}, taxa_condominio_unidades(count), faturamentos_competencia(competencia)`)
    .eq("ativo", true)
    .order("titulo")
    .returns<TaxaRow[]>();
  if (error) throw new Error(`Falha ao listar as cuotas: ${error.message}`);

  const pendentes = new Set(
    taxasSemEmissaoNoMes(
      data.map((taxa) => ({
        id: taxa.id,
        titulo: taxa.titulo,
        ativo: taxa.ativo,
        unidadesVinculadas: taxa.taxa_condominio_unidades[0]?.count ?? 0,
        competenciasEmitidas: taxa.faturamentos_competencia.map((f) => f.competencia),
      })),
      mes,
    ).map((taxa) => taxa.id),
  );
  return data.filter((taxa) => pendentes.has(taxa.id));
}

async function emitirCobrancasDaCuota(taxa: TaxaCondominio, mes: string): Promise<ResultadoEmissao> {
  const supabase = createAdminClient();
  const competencia = `${mes}-01`;
  const resultado = { taxaId: taxa.id, titulo: taxa.titulo };

  const [vinculos, cobrancas, { data: faturamento, error: faturamentoError }] = await Promise.all([
    buscarTodas((de, ate) =>
      supabase
        .from("taxa_condominio_unidades")
        .select("unidade_id", { count: "exact" })
        .eq("taxa_condominio_id", taxa.id)
        .order("id")
        .range(de, ate)
        .returns<{ unidade_id: string }[]>(),
    ),
    buscarTodas((de, ate) =>
      supabase
        .from("cobrancas")
        .select("unidade_id", { count: "exact" })
        .eq("taxa_condominio_id", taxa.id)
        .eq("competencia", competencia)
        .order("id")
        .range(de, ate)
        .returns<{ unidade_id: string }[]>(),
    ),
    supabase
      .from("faturamentos_competencia")
      .select("id")
      .eq("taxa_condominio_id", taxa.id)
      .eq("competencia", competencia)
      .maybeSingle<{ id: string }>(),
  ]);
  const erro = vinculos.error ?? cobrancas.error ?? faturamentoError;
  if (erro) throw new Error(`Falha ao preparar a emissão de ${taxa.titulo}: ${erro.message}`);

  // alguém emitiu pela tela entre a listagem e este step
  if (faturamento) return { ...resultado, emitidas: 0, pulada: "competência já fechada" };

  // mesmo escopo do botão: unidades vinculadas que ainda não têm a cobrança do mês
  const jaCobradas = new Set((cobrancas.data ?? []).map((c) => c.unidade_id));
  const unidadeIds = (vinculos.data ?? []).map((v) => v.unidade_id).filter((id) => !jaCobradas.has(id));
  if (unidadeIds.length === 0) return { ...resultado, emitidas: 0, pulada: "nenhuma unidade a cobrar" };

  const { data: quantidade, error } = await supabase.rpc("emitir_cobrancas_taxa", {
    p_taxa_condominio_id: taxa.id,
    p_competencia: competencia,
    p_data_vencimento: vencimentoDaCompetencia(taxa.dia_vencimento, mes),
    p_valor_usd: taxa.valor_usd,
    ...paramsRegrasEncargos(taxa),
    p_unidade_ids: unidadeIds,
  });
  if (error) {
    // corrida com a tela: a função SQL recusa competência já processada, e isso não é falha
    if (error.message.includes("já foi processada")) return { ...resultado, emitidas: 0, pulada: error.message };
    throw new Error(`Falha ao emitir ${taxa.titulo}: ${error.message}`);
  }
  return { ...resultado, emitidas: Number(quantidade ?? 0), pulada: null };
}

export const emitirCobrancasDoMes = inngest.createFunction(
  {
    id: "emitir-cobrancas-do-mes",
    name: "Emitir cobranças do mês",
    // dia 1 às 6h de Caracas: as cobranças já existem quando o administrador abre o app de manhã
    triggers: [cron("TZ=America/Caracas 0 6 1 * *")],
    retries: 3,
  },
  async ({ step }) => {
    // dentro de steps pra não mudarem entre as tentativas (a função é reexecutada a cada step)
    const mes = await step.run("definir-mes", () => mesAtualCaracas(new Date()));
    const cuotas = await step.run("listar-cuotas-pendentes", () => listarCuotasPendentes(mes));

    const emissoes: ResultadoEmissao[] = [];
    const falhas: string[] = [];
    for (const cuota of cuotas) {
      try {
        emissoes.push(await step.run(`emitir-${cuota.id}`, () => emitirCobrancasDaCuota(cuota, mes)));
      } catch (err) {
        // o step esgotou as tentativas: anota e segue pras outras cuotas, que não dependem desta
        if (!(err instanceof StepError)) throw err;
        falhas.push(`${cuota.titulo}: ${err.message}`);
      }
    }

    if (falhas.length > 0) {
      throw new NonRetriableError(`Cuotas não emitidas em ${mes}: ${falhas.join("; ")}`);
    }
    return { mes, emissoes };
  },
);
