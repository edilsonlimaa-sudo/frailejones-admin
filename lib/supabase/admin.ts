import "server-only";

import { createClient } from "@supabase/supabase-js";

// Cliente com a chave secreta do projeto (service_role): só pra código que roda sem usuário logado,
// como as funções do Inngest. Ignora RLS e pode chamar as funções SQL restritas a
// authenticated/service_role (emitir_cobrancas_taxa etc.). Nunca importar de componente cliente:
// "server-only" faz o build falhar se isso acontecer.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configuradas");
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
