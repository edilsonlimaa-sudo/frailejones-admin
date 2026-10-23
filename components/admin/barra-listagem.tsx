import type { LucideIcon } from "lucide-react";

import { BarraFixa } from "@/components/admin/barra-fixa";

type BarraListagemProps = {
  icone: LucideIcon;
  titulo: string;
  // botão principal da tela (novo registro, atualizar), à direita do título
  acao?: React.ReactNode;
  // linhas extras presas junto (busca, filtros)
  children?: React.ReactNode;
};

// Cabeçalho das listagens, na barra de vidro: selo com o ícone da seção, o título em destaque e
// a ação principal; busca e filtros vêm como filhos. O mesmo "header duplo" do Dashboard, pra
// toda tela do app abrir do mesmo jeito.
export function BarraListagem({ icone: Icone, titulo, acao, children }: BarraListagemProps) {
  return (
    <BarraFixa>
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icone className="size-4.5" />
          </span>
          <h1 className="truncate text-2xl font-bold tracking-tight">{titulo}</h1>
        </div>
        {acao}
      </div>
      {children}
    </BarraFixa>
  );
}
