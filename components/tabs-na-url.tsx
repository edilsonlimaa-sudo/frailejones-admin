"use client";

import type { ComponentProps } from "react";

import { Tabs } from "@/components/ui/tabs";

type TabsNaUrlProps = Omit<ComponentProps<typeof Tabs>, "value" | "defaultValue" | "onValueChange"> & {
  // nome do parâmetro na URL (ex.: "aba" → ?aba=cobrancas)
  parametro: string;
  // aba vinda do searchParams da página (já validada); a padrão não aparece na URL
  abaInicial: string;
  abaPadrao: string;
};

// Abas que lembram a selecionada na URL, pra que recarregar a página (ou abrir um link copiado)
// volte na mesma aba em vez da primeira. A página lê o parâmetro no servidor e passa em abaInicial;
// aqui a troca de aba só reescreve a URL com history.replaceState — sem nova navegação nem nova
// busca no servidor, e sem empilhar uma entrada no histórico por clique.
export function TabsNaUrl({ parametro, abaInicial, abaPadrao, ...props }: TabsNaUrlProps) {
  return (
    <Tabs
      defaultValue={abaInicial}
      onValueChange={(valor) => {
        const url = new URL(window.location.href);
        if (valor === abaPadrao) url.searchParams.delete(parametro);
        else url.searchParams.set(parametro, String(valor));
        window.history.replaceState(null, "", url);
      }}
      {...props}
    />
  );
}
