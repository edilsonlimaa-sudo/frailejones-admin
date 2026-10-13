export type CotacaoBcv = {
  id: string;
  data_cotacao: string;
  tasa_ves: number;
  fuente: string;
  created_at: string;
};

// última vez que a Edge Function consultou a fonte (tabela de uma linha só)
export type CotacaoBcvConsulta = {
  consultado_em: string;
  erro: string | null;
};
