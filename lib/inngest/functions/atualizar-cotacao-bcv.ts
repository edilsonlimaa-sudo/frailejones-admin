import { NonRetriableError, cron } from "inngest";

import { ultimoDiaUtil } from "@/lib/cotacao-bcv";
import { hojeCaracas, horaCaracas } from "@/lib/fuso";
import { inngest } from "@/lib/inngest/client";

// Consulta diária do BCV pelo Inngest: garante que a taxa de cada dia útil fique gravada mesmo que
// ninguém abra o app no dia. A verificação sob demanda (lib/cotacao-bcv.ts) continua valendo quando
// alguém abre o app; esta função cobre os dias em que ninguém abre. As duas chamam a mesma Edge
// Function, que grava em cotacao_bcv e registra a consulta em cotacao_bcv_consulta.
//
// Horários em Caracas (UTC-4 o ano todo). O BCV publica à tarde a taxa que vale pro próximo dia
// útil, então a passada das 18h já pega a de amanhã (sexta pega a de segunda); a das 9h é rede de
// segurança pra quando a publicação saiu tarde. Se a fonte ainda não publicou o esperado, a função
// dorme 1h e consulta de novo, até 3 consultas por passada. Feriado não publica: termina sem gravar.

const CONSULTAS_POR_PASSADA = 3;
const ESPERA_ENTRE_CONSULTAS = "1h";
// a Edge Function tenta duas fontes com 15s cada
const TIMEOUT_MS = 40_000;
// a partir desta hora (Caracas) o esperado é a taxa do próximo dia útil, não a de hoje
const HORA_PUBLICACAO = 16;

type RespostaEdgeFunction = {
  cotacao?: { dataCotacao: string; tasaVes: number; fuente: string };
  inalterada?: boolean;
  falhas?: string[];
  error?: string;
};

// sexta avança pra segunda; sábado e domingo também caem na segunda
export function proximoDiaUtil(dataIso: string): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  const dia = data.getUTCDay();
  const avanco = dia === 5 ? 3 : dia === 6 ? 2 : 1;
  data.setUTCDate(data.getUTCDate() + avanco);
  return data.toISOString().slice(0, 10);
}

// data_cotacao que deve existir depois desta passada
export function dataEsperada(agora: Date = new Date()): string {
  const hoje = hojeCaracas(agora);
  return horaCaracas(agora) >= HORA_PUBLICACAO ? proximoDiaUtil(hoje) : ultimoDiaUtil(hoje);
}

async function invocarEdgeFunction(): Promise<RespostaEdgeFunction> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) {
    throw new NonRetriableError("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY não configuradas");
  }

  const response = await fetch(`${url}/functions/v1/atualizar-cotacao-bcv`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as RespostaEdgeFunction;
  if (response.ok) return body;

  const motivo = body.error ?? `Edge Function respondeu HTTP ${response.status}`;
  // 422: taxa inválida ou variação suspeita. A função não gravou e alguém precisa conferir
  // (cadastro manual pela tela de cotação); repetir não resolve.
  if (response.status === 422) throw new NonRetriableError(motivo);
  // 502 (nenhuma fonte respondeu) e demais: transitório, o Inngest repete com espera crescente
  throw new Error(motivo);
}

export const atualizarCotacaoBcv = inngest.createFunction(
  {
    id: "atualizar-cotacao-bcv",
    name: "Atualizar cotação BCV",
    triggers: [cron("TZ=America/Caracas 0 9 * * 1-5"), cron("TZ=America/Caracas 0 18 * * 1-5")],
    retries: 3,
  },
  async ({ step }) => {
    // dentro de um step pra não mudar entre as consultas: a função é reexecutada após cada espera
    const esperada = await step.run("definir-data-esperada", () => dataEsperada());

    let dataFonte: string | null = null;
    for (let consulta = 1; consulta <= CONSULTAS_POR_PASSADA; consulta++) {
      const resposta = await step.run(`consultar-fonte-${consulta}`, invocarEdgeFunction);
      dataFonte = resposta.cotacao?.dataCotacao ?? null;
      if (dataFonte != null && dataFonte >= esperada) {
        return { esperada, dataFonte, gravouNova: resposta.inalterada === false, consulta };
      }
      if (consulta < CONSULTAS_POR_PASSADA) {
        await step.sleep(`aguardar-publicacao-${consulta}`, ESPERA_ENTRE_CONSULTAS);
      }
    }

    // feriado ou publicação atrasada: a fonte não tem nada além do que já está gravado. O app segue
    // com a última cotação e a verificação sob demanda cobre quando alguém abrir.
    return { esperada, dataFonte, gravouNova: false, publicada: false };
  },
);
