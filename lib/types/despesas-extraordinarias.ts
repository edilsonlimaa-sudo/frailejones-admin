import type { RegrasEncargos } from "@/lib/encargos";

export type DespesaExtraordinaria = RegrasEncargos & {
  id: string;
  titulo: string;
  descricao: string | null;
  valor_total_usd: number;
  valor_por_unidade_usd: number;
  data_vencimento: string;
  created_at: string;
  unidade_ids: string[];
};
