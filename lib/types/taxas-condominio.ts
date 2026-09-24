export type TaxaCondominio = {
  id: string;
  titulo: string;
  valor_usd: number;
  dia_vencimento: number;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  dias_graca: number;
  ativo: boolean;
  created_at: string;
};
