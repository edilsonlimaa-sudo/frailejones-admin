import { classificarCobranca, type CobrancaClassificada } from "@/lib/estado-de-cuenta";
import type { CobrancaDaUnidade } from "@/lib/types/cobrancas";

// Lista de cobranças de uma unidade organizada pra leitura: o que exige ação (pendentes) separado
// do histórico (pagas e canceladas), e cada parte agrupada pelo mês de competência. A situação de
// cada cobrança vem de classificarCobranca, a mesma regra do estado de conta.

export const FILTROS_COBRANCAS = ["todos", "pendientes", "pagados"] as const;
export type FiltroCobrancas = (typeof FILTROS_COBRANCAS)[number];
export const FILTRO_COBRANCAS_PADRAO: FiltroCobrancas = "todos";

// valor vem da URL (?filtro=): qualquer coisa fora da lista cai no padrão
export function resolverFiltroCobrancas(valor: string | string[] | undefined): FiltroCobrancas {
  return FILTROS_COBRANCAS.find((f) => f === valor) ?? FILTRO_COBRANCAS_PADRAO;
}

export type ItemCobranca = CobrancaClassificada & {
  cobranca: CobrancaDaUnidade;
  // pendente ainda dentro do prazo, mas com o vencimento já passado (está na carência)
  emCarencia: boolean;
  // pendente a vencer: dias até o vencimento
  diasParaVencer: number | null;
};

export type GrupoMes = { mes: string; itens: ItemCobranca[]; total: number };

export type CobrancasOrganizadas = {
  // mais antigo primeiro: o que cobrar primeiro fica em cima
  pendentes: GrupoMes[];
  // mais recente primeiro
  historial: GrupoMes[];
  totalPendente: number;
  quantidade: { todos: number; pendientes: number; pagados: number };
};

const diasEntre = (deIso: string, ateIso: string) =>
  Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000);

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

function agruparPorMes(itens: ItemCobranca[], ordem: "asc" | "desc"): GrupoMes[] {
  const porMes = new Map<string, ItemCobranca[]>();
  for (const item of itens) {
    const mes = item.cobranca.competencia.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), item]);
  }
  const sinal = ordem === "asc" ? 1 : -1;
  return [...porMes.entries()]
    .sort(([a], [b]) => sinal * a.localeCompare(b))
    .map(([mes, lista]) => ({
      mes,
      itens: lista.sort((a, b) => sinal * a.cobranca.data_vencimento.localeCompare(b.cobranca.data_vencimento)),
      total: arredondar(lista.filter((i) => i.estado !== "cancelado").reduce((acc, i) => acc + i.valor, 0)),
    }));
}

// agora: instante de referência, fixado uma vez no servidor (o resultado é repassado ao cliente)
export function organizarCobrancas(cobrancas: CobrancaDaUnidade[], agora: Date): CobrancasOrganizadas {
  const hojeIso = agora.toISOString().slice(0, 10);
  const itens: ItemCobranca[] = cobrancas.map((cobranca) => {
    const classificada = classificarCobranca(cobranca, hojeIso);
    const aVencer = classificada.estado === "porVencer";
    return {
      ...classificada,
      cobranca,
      emCarencia: aVencer && hojeIso > cobranca.data_vencimento,
      diasParaVencer: aVencer && hojeIso <= cobranca.data_vencimento ? diasEntre(hojeIso, cobranca.data_vencimento) : null,
    };
  });

  const pendentes = itens.filter((i) => i.estado === "vencido" || i.estado === "porVencer");
  const historial = itens.filter((i) => i.estado !== "vencido" && i.estado !== "porVencer");

  return {
    pendentes: agruparPorMes(pendentes, "asc"),
    historial: agruparPorMes(historial, "desc"),
    totalPendente: arredondar(pendentes.reduce((acc, i) => acc + i.valor, 0)),
    quantidade: {
      todos: itens.length,
      pendientes: pendentes.length,
      pagados: historial.filter((i) => i.estado !== "cancelado").length,
    },
  };
}
