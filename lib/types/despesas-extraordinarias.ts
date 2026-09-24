export type DespesaExtraordinaria = {
  id: string;
  titulo: string;
  descricao: string | null;
  valor_total_usd: number;
  valor_por_unidade_usd: number;
  data_vencimento: string;
  pct_multa_atraso: number;
  pct_juros_diario: number;
  dias_graca: number;
  created_at: string;
  unidade_ids: string[];
};
