import { calcularEncargos, pagamentosParaEncargos, type RegrasEncargos } from "@/lib/encargos";
import type { CobrancaStatus } from "@/lib/types/cobrancas";

export type CobrancaPendenteTotal = RegrasEncargos & {
  id: string;
  valor_usd: number;
  valor_credito_abatido_usd: number;
  data_vencimento: string;
  status: CobrancaStatus;
  unidade: { id: string; identificacao: string; proprietario: { nome: string } | null } | null;
  pagamento_cobrancas: Parameters<typeof pagamentosParaEncargos>[0];
};

export type DividaDaUnidade = {
  // "" quando a unidade foi removida
  id: string;
  identificacao: string | null;
  proprietario: string | null;
  cobrancas: number;
  total: number;
  // atraso da cobrança mais antiga da unidade (0 = nada vencido ainda)
  maxDiasAtraso: number;
};

// faixas de atraso (aging), contadas do fim da carência. "aVencer" = pendente ainda no prazo
export const FAIXAS_ATRASO = ["aVencer", "ate30", "ate60", "ate90", "mais90"] as const;
export type FaixaAtraso = (typeof FAIXAS_ATRASO)[number];

export function faixaDoAtraso(diasAtraso: number): FaixaAtraso {
  if (diasAtraso <= 0) return "aVencer";
  if (diasAtraso <= 30) return "ate30";
  if (diasAtraso <= 60) return "ate60";
  if (diasAtraso <= 90) return "ate90";
  return "mais90";
}

export type ResumoDivida = {
  principal: number;
  encargos: number;
  total: number;
  pendentes: number;
  vencidas: number;
  valorVencido: number;
  // unidades com ao menos uma cobrança vencida
  unidadesEmAtraso: number;
  porFaixa: Record<FaixaAtraso, { quantidade: number; valor: number }>;
  // ordenadas da maior dívida pra menor
  unidades: DividaDaUnidade[];
  // ainda no prazo, mas o prazo (vencimento + carência) acaba nos próximos dias
  vencendoEmBreve: { quantidade: number; valor: number };
};

// janela do aviso "vence nos próximos dias"
export const DIAS_VENCENDO_EM_BREVE = 7;

const somarDias = (dataIso: string, dias: number) => {
  const data = new Date(`${dataIso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
};

// tudo que está pendente hoje, de qualquer competência, com multa e juros calculados hoje pela
// mesma regra das demais telas (lib/encargos)
export function resumirDivida(cobrancas: CobrancaPendenteTotal[], hojeIso: string): ResumoDivida {
  const limiteEmBreve = somarDias(hojeIso, DIAS_VENCENDO_EM_BREVE);
  const porFaixa = Object.fromEntries(
    FAIXAS_ATRASO.map((f) => [f, { quantidade: 0, valor: 0 }]),
  ) as ResumoDivida["porFaixa"];
  const porUnidade = new Map<string, DividaDaUnidade>();
  let principal = 0;
  let encargos = 0;
  let vencidas = 0;
  let valorVencido = 0;
  const vencendoEmBreve = { quantidade: 0, valor: 0 };

  for (const c of cobrancas) {
    const e = calcularEncargos({ ...c, pagamentos: pagamentosParaEncargos(c.pagamento_cobrancas) }, hojeIso);
    if (e.saldoDevedor <= 0) continue;
    principal += e.saldoDevedor;
    encargos += e.valorMulta + e.valorJuros;
    if (e.diasAtraso > 0) {
      vencidas += 1;
      valorVencido += e.valorTotalComEncargos;
    } else if (somarDias(c.data_vencimento, c.dias_graca) <= limiteEmBreve) {
      vencendoEmBreve.quantidade += 1;
      vencendoEmBreve.valor += e.valorTotalComEncargos;
    }

    const faixa = porFaixa[faixaDoAtraso(e.diasAtraso)];
    faixa.quantidade += 1;
    faixa.valor += e.valorTotalComEncargos;

    const chave = c.unidade?.id ?? "";
    const divida = porUnidade.get(chave) ?? {
      id: chave,
      identificacao: c.unidade?.identificacao ?? null,
      proprietario: c.unidade?.proprietario?.nome ?? null,
      cobrancas: 0,
      total: 0,
      maxDiasAtraso: 0,
    };
    divida.cobrancas += 1;
    divida.total += e.valorTotalComEncargos;
    divida.maxDiasAtraso = Math.max(divida.maxDiasAtraso, e.diasAtraso);
    porUnidade.set(chave, divida);
  }

  const unidades = [...porUnidade.values()].sort((a, b) => b.total - a.total);
  return {
    principal,
    encargos,
    total: principal + encargos,
    pendentes: unidades.reduce((acc, u) => acc + u.cobrancas, 0),
    vencidas,
    valorVencido,
    unidadesEmAtraso: unidades.filter((u) => u.maxDiasAtraso > 0).length,
    porFaixa,
    unidades,
    vencendoEmBreve,
  };
}
