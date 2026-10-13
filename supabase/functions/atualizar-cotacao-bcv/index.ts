// Busca a taxa oficial USD/VES do BCV e grava em cotacao_bcv (upsert por data_cotacao).
// Chamada pelo servidor Next quando a cotação vigente está atrasada (lib/cotacao-bcv.ts) e pelo
// botão "Atualizar cotação agora". Fonte principal: DolarApi; reserva: HTML do site do BCV.
// Toda chamada fica registrada em cotacao_bcv_consulta, que o app usa pra não consultar a fonte
// de novo antes do intervalo mínimo.
//
// A data gravada é a "fecha valor" publicada pelo BCV (a taxa divulgada à tarde vale para o
// próximo dia útil), não a data da consulta.

import { createClient } from "npm:@supabase/supabase-js@2";

const DOLAR_API_URL = "https://ve.dolarapi.com/v1/dolares/oficial";
const BCV_URL = "https://www.bcv.org.ve/";
const TIMEOUT_MS = 15_000;
// rejeita variação maior que isso em relação à cotação anterior (provável erro de leitura)
const VARIACAO_MAXIMA = 0.25;

type Cotacao = { dataCotacao: string; tasaVes: number; fuente: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function buscarDolarApi(): Promise<Cotacao> {
  const response = await fetch(DOLAR_API_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`DolarApi respondeu HTTP ${response.status}`);

  const data: { promedio: number | null; fechaActualizacion: string } = await response.json();
  if (typeof data.promedio !== "number") throw new Error("DolarApi não retornou uma taxa válida");

  return { dataCotacao: data.fechaActualizacion.slice(0, 10), tasaVes: data.promedio, fuente: "dolarapi" };
}

async function buscarSiteBcv(): Promise<Cotacao> {
  const response = await fetch(BCV_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Site do BCV respondeu HTTP ${response.status}`);
  const html = await response.text();

  // <div id="dolar"> ... <strong class="strong-tb">872,39270000</strong>
  const taxa = html.match(/id="dolar"[\s\S]*?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/)?.[1];
  // Fecha Valor: <span class="date-display-single" ... content="2026-10-06T00:00:00-04:00">
  const data = html.match(/Fecha Valor:[\s\S]*?content="(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!taxa || !data) throw new Error("Layout do site do BCV mudou: taxa ou data não encontrada");

  // formato venezuelano: ponto de milhar, vírgula decimal
  const tasaVes = Number(taxa.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(tasaVes)) throw new Error(`Taxa ilegível no site do BCV: ${taxa}`);

  return { dataCotacao: data, tasaVes, fuente: "bcv.org.ve" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // gravado antes de ir à fonte: requisições simultâneas do app já veem a consulta em andamento
  await supabase.from("cotacao_bcv_consulta").upsert({ id: true, consultado_em: new Date().toISOString(), erro: null });

  const falhar = async (body: { error: string } & Record<string, unknown>, status: number) => {
    await supabase.from("cotacao_bcv_consulta").update({ erro: body.error }).eq("id", true);
    return json(body, status);
  };

  const falhas: string[] = [];
  let cotacao: Cotacao | null = null;
  for (const buscar of [buscarDolarApi, buscarSiteBcv]) {
    try {
      cotacao = await buscar();
      break;
    } catch (err) {
      falhas.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!cotacao) {
    console.error("Nenhuma fonte de cotação respondeu", falhas);
    return falhar({ error: "Nenhuma fonte de cotação respondeu", falhas }, 502);
  }

  if (cotacao.tasaVes <= 0) {
    return falhar({ error: `Taxa inválida: ${cotacao.tasaVes}`, cotacao }, 422);
  }

  const { data: anterior, error: anteriorError } = await supabase
    .from("cotacao_bcv")
    .select("data_cotacao, tasa_ves")
    .lt("data_cotacao", cotacao.dataCotacao)
    .order("data_cotacao", { ascending: false })
    .limit(1)
    .maybeSingle<{ data_cotacao: string; tasa_ves: number }>();
  if (anteriorError) return falhar({ error: anteriorError.message }, 500);

  if (anterior) {
    const variacao = Math.abs(cotacao.tasaVes - anterior.tasa_ves) / anterior.tasa_ves;
    if (variacao > VARIACAO_MAXIMA) {
      console.error("Variação suspeita, cotação não gravada", { cotacao, anterior });
      return falhar(
        {
          error: `Variação de ${(variacao * 100).toFixed(1)}% em relação a ${anterior.data_cotacao}; cadastre manualmente se estiver correta`,
          cotacao,
          anterior,
        },
        422,
      );
    }
  }

  const { data: existente, error: existenteError } = await supabase
    .from("cotacao_bcv")
    .select("tasa_ves")
    .eq("data_cotacao", cotacao.dataCotacao)
    .maybeSingle<{ tasa_ves: number }>();
  if (existenteError) return falhar({ error: existenteError.message }, 500);

  // só grava quando a taxa muda, pra "Atualizada em" (created_at) registrar quando o valor entrou,
  // e não a última consulta
  if (existente && Number(existente.tasa_ves) === cotacao.tasaVes) {
    return json({ cotacao, inalterada: true, falhas });
  }

  const { error } = await supabase.from("cotacao_bcv").upsert(
    {
      data_cotacao: cotacao.dataCotacao,
      tasa_ves: cotacao.tasaVes,
      fuente: cotacao.fuente,
      // created_at não muda em upsert (default só vale na inserção); enviamos pra "Atualizada em"
      // refletir quando a taxa foi corrigida
      created_at: new Date().toISOString(),
    },
    { onConflict: "data_cotacao" },
  );
  if (error) return falhar({ error: error.message }, 500);

  return json({ cotacao, inalterada: false, falhas });
});
