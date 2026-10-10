import { resumirPendencias, type ResumoPendencias, type SituacaoConta } from "@/lib/estado-de-cuenta";
import type { CobrancaParaEncargos } from "@/lib/encargos";

// Listagem de unidades com a situação de conta de cada uma (mesma regra do estado de conta),
// filtro por situação e ordenação. Filtro, ordem e proprietário ficam na URL.

export const FILTROS_SITUACAO = ["todas", "alDia", "porVencer", "enAtraso"] as const;
export type FiltroSituacao = (typeof FILTROS_SITUACAO)[number];
export const ORDENS_UNIDADES = ["unidad", "deuda", "atraso"] as const;
export type OrdemUnidades = (typeof ORDENS_UNIDADES)[number];

export const FILTRO_SITUACAO_PADRAO: FiltroSituacao = "todas";
export const ORDEM_UNIDADES_PADRAO: OrdemUnidades = "unidad";

// valores vêm da URL (editáveis): fora da lista cai no padrão
export function resolverFiltroSituacao(valor: string | string[] | undefined): FiltroSituacao {
  return FILTROS_SITUACAO.find((f) => f === valor) ?? FILTRO_SITUACAO_PADRAO;
}

export function resolverOrdemUnidades(valor: string | string[] | undefined): OrdemUnidades {
  return ORDENS_UNIDADES.find((o) => o === valor) ?? ORDEM_UNIDADES_PADRAO;
}

export type CobrancaPendenteDaUnidade = CobrancaParaEncargos & { unidade_id: string };

// agora: fixado uma vez no servidor; o resultado (serializável) vai pro componente da listagem
export function resumirSituacaoUnidades(
  unidadeIds: string[],
  pendentes: CobrancaPendenteDaUnidade[],
  agora: Date,
): Record<string, ResumoPendencias> {
  const hojeIso = agora.toISOString().slice(0, 10);
  const porUnidade = new Map<string, CobrancaPendenteDaUnidade[]>();
  for (const c of pendentes) porUnidade.set(c.unidade_id, [...(porUnidade.get(c.unidade_id) ?? []), c]);
  return Object.fromEntries(unidadeIds.map((id) => [id, resumirPendencias(porUnidade.get(id) ?? [], hojeIso)]));
}

export type ContagemSituacoes = Record<SituacaoConta, number> & { total: number; divida: number };

export function contarSituacoes(resumos: ResumoPendencias[]): ContagemSituacoes {
  const contagem: ContagemSituacoes = { alDia: 0, porVencer: 0, enAtraso: 0, total: resumos.length, divida: 0 };
  for (const r of resumos) {
    contagem[r.situacao] += 1;
    contagem.divida += r.divida.total;
  }
  contagem.divida = Math.round(contagem.divida * 100) / 100;
  return contagem;
}
