// o que aconteceu com o emitido do mês: liga a visão de competência (cobranças do mês) à de caixa
// ("Dívida quitada no mês"). Quitado dentro do mês + nos meses seguintes + em aberto = emitido.
// Multa e juros não fazem parte do emitido, então ficam fora da barra, numa linha à parte.
export type RecaudacaoDoMes = {
  emitido: number;
  quitadoNoMes: number;
  quitadoDepois: number;
  emAberto: number;
  encargos: number;
  // % do emitido quitado até vencimento + carência; null se o prazo de nenhuma cobrança acabou
  percentualEmDia: number | null;
};
