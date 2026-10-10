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

// como a linha se identifica: na tela da unidade é a origem (taxa ou rateio); no detalhe de um
// rateio é a unidade (com o dono e link pra ela)
export type RotuloCobranca = {
  titulo: string;
  subtitulo: string | null;
  href: string | null;
  // mostra a etiqueta "Extraordinaria" (só faz sentido quando a linha é a origem)
  extraordinaria: boolean;
};

export type ItemCobranca = CobrancaClassificada & {
  cobranca: CobrancaDaUnidade;
  rotulo: RotuloCobranca;
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

// sem agrupar, a lista vira um grupo só, com mes "" (o componente não mostra cabeçalho de mês)
function agrupar(itens: ItemCobranca[], ordem: "asc" | "desc", porMes: boolean): GrupoMes[] {
  const grupos = new Map<string, ItemCobranca[]>();
  for (const item of itens) {
    const mes = porMes ? item.cobranca.competencia.slice(0, 7) : "";
    grupos.set(mes, [...(grupos.get(mes) ?? []), item]);
  }
  const sinal = ordem === "asc" ? 1 : -1;
  return [...grupos.entries()]
    .sort(([a], [b]) => sinal * a.localeCompare(b))
    .map(([mes, lista]) => ({
      mes,
      itens: lista.sort(
        (a, b) =>
          sinal * a.cobranca.data_vencimento.localeCompare(b.cobranca.data_vencimento) ||
          a.rotulo.titulo.localeCompare(b.rotulo.titulo),
      ),
      total: arredondar(lista.filter((i) => i.estado !== "cancelado").reduce((acc, i) => acc + i.valor, 0)),
    }));
}

const rotuloPelaOrigem = (c: CobrancaDaUnidade): RotuloCobranca => ({
  titulo: c.titulo_origem,
  subtitulo: null,
  href: null,
  extraordinaria: c.tipo === "extraordinaria",
});

type OpcoesOrganizacao = {
  // padrão: agrupa por mês de competência (tela da unidade)
  agruparPorMes?: boolean;
  // padrão: a origem da cobrança
  rotulo?: (c: CobrancaDaUnidade) => RotuloCobranca;
};

// agora: instante de referência, fixado uma vez no servidor (o resultado é repassado ao cliente)
export function organizarCobrancas(
  cobrancas: CobrancaDaUnidade[],
  agora: Date,
  { agruparPorMes = true, rotulo = rotuloPelaOrigem }: OpcoesOrganizacao = {},
): CobrancasOrganizadas {
  const hojeIso = agora.toISOString().slice(0, 10);
  const itens: ItemCobranca[] = cobrancas.map((cobranca) => {
    const classificada = classificarCobranca(cobranca, hojeIso);
    const aVencer = classificada.estado === "porVencer";
    return {
      ...classificada,
      cobranca,
      rotulo: rotulo(cobranca),
      emCarencia: aVencer && hojeIso > cobranca.data_vencimento,
      diasParaVencer: aVencer && hojeIso <= cobranca.data_vencimento ? diasEntre(hojeIso, cobranca.data_vencimento) : null,
    };
  });

  const pendentes = itens.filter((i) => i.estado === "vencido" || i.estado === "porVencer");
  const historial = itens.filter((i) => i.estado !== "vencido" && i.estado !== "porVencer");

  return {
    pendentes: agrupar(pendentes, "asc", agruparPorMes),
    historial: agrupar(historial, "desc", agruparPorMes),
    totalPendente: arredondar(pendentes.reduce((acc, i) => acc + i.valor, 0)),
    quantidade: {
      todos: itens.length,
      pendientes: pendentes.length,
      pagados: historial.filter((i) => i.estado !== "cancelado").length,
    },
  };
}
