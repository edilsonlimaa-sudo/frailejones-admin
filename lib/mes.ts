// navegação por mês via ?mes=YYYY-MM (Painel e Liquidações). Sem parâmetro válido, vale o mês atual.
import { hojeCaracas } from "@/lib/fuso";

export type AnoMes = { ano: number; mes: number };

export function parseMes(mes: string | undefined): AnoMes {
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNumero] = mes.split("-").map(Number);
    if (mesNumero >= 1 && mesNumero <= 12) return { ano, mes: mesNumero };
  }
  return mesAtual();
}

// mês corrente no calendário de Caracas (em UTC, a noite do último dia já seria o mês seguinte)
export function mesAtual(): AnoMes {
  const [ano, mes] = hojeCaracas().split("-").map(Number);
  return { ano, mes };
}

export function formatMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function mesAdjacente(ano: number, mes: number, delta: number): AnoMes {
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1 };
}

// rota de um mês: "/?mes=2026-10", "/liquidacoes?mes=2026-10"
export function hrefDoMes(basePath: string, { ano, mes }: AnoMes): string {
  return `${basePath}?mes=${formatMes(ano, mes)}`;
}
