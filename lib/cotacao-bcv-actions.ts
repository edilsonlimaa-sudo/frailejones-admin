"use server";

import { dataCotacaoVigente, garantirCotacaoBcvAtualizada } from "@/lib/cotacao-bcv";

// chamada pelo VigiaCotacaoBcv em abas que ficam abertas: atualiza se preciso e devolve a data da
// cotação vigente, pra tela recarregar quando ela mudar (taxa nova ou virada do dia)
export async function verificarCotacaoBcv(): Promise<{ dataVigente: string | null }> {
  await garantirCotacaoBcvAtualizada();
  return { dataVigente: await dataCotacaoVigente() };
}
