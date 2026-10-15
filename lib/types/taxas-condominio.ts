import type { RegrasEncargos } from "@/lib/encargos";

export type TaxaCondominio = RegrasEncargos & {
  id: string;
  titulo: string;
  valor_usd: number;
  dia_vencimento: number;
  ativo: boolean;
  created_at: string;
};
