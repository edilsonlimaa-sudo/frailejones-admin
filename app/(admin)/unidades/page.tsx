import { createClient } from "@/lib/supabase/server";
import { UnidadesManager } from "@/components/admin/unidades/unidades-manager";
import type { Proprietario, Unidade } from "@/lib/types/unidades";

export default async function UnidadesPage() {
  const supabase = await createClient();

  const [{ data: unidades, error: unidadesError }, { data: proprietarios, error: proprietariosError }] =
    await Promise.all([
      supabase
        .from("unidades")
        .select("id, identificacao, proprietario_id, gera_cobranca, created_at, proprietario:proprietarios(id, nome)")
        .order("identificacao", { ascending: true })
        .returns<Unidade[]>(),
      supabase
        .from("proprietarios")
        .select("id, nome, documento_identidad, telefone_whatsapp, email")
        .order("nome", { ascending: true })
        .returns<Proprietario[]>(),
    ]);

  if (unidadesError || proprietariosError) {
    return (
      <p className="text-sm text-destructive">
        Erro ao carregar dados: {unidadesError?.message ?? proprietariosError?.message}
      </p>
    );
  }

  return (
    <UnidadesManager
      unidades={unidades ?? []}
      proprietarios={proprietarios ?? []}
    />
  );
}
