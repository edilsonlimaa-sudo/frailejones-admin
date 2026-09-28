"use server";

import { createClient } from "@/lib/supabase/server";

export type UnidadeEncontrada = { id: string; identificacao: string };

type ProprietarioComUnidades = {
  id: string;
  unidades: UnidadeEncontrada[];
};

// busca roda 100% no servidor (nunca client-side): evita expor a tabela `proprietarios` inteira
// via anon key no navegador enquanto RLS não está habilitado no banco
export async function buscarUnidadesPorCedula(cedulaInput: string): Promise<{ unidades: UnidadeEncontrada[] }> {
  const cedula = cedulaInput.trim();
  if (!cedula) return { unidades: [] };

  // escapa curingas do ILIKE (%, _, \) pra impedir que uma cédula com esses caracteres vire
  // uma busca "coringa" que retorne unidades de outros propietários
  const cedulaEscapada = cedula.replace(/[\\%_]/g, (char) => `\\${char}`);

  const supabase = await createClient();
  const { data } = await supabase
    .from("proprietarios")
    .select("id, unidades(id, identificacao)")
    .ilike("documento_identidad", cedulaEscapada)
    .returns<ProprietarioComUnidades[]>();

  const unidades = (data ?? [])
    .flatMap((proprietario) => proprietario.unidades)
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao));

  return { unidades };
}
