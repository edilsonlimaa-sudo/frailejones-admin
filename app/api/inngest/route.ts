import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { atualizarCotacaoBcv } from "@/lib/inngest/functions/atualizar-cotacao-bcv";
import { emitirCobrancasDoMes } from "@/lib/inngest/functions/emitir-cobrancas-do-mes";

// Endpoint que o Inngest chama pra sincronizar e executar as funções. Fica fora da checagem de
// sessão do proxy.ts (o Inngest assina as requisições com INNGEST_SIGNING_KEY).
// A Edge Function pode levar ~30s (duas fontes, 15s cada): folga pro step terminar.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [atualizarCotacaoBcv, emitirCobrancasDoMes],
});
