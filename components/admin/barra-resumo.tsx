import { BarraFixa } from "@/components/admin/barra-fixa";

type BarraResumoProps = {
  // nome da tela, só pra leitores de tela: o breadcrumb do header já o mostra
  titulo: string;
  // o que o breadcrumb não diz: um resumo curto do que há na lista
  resumo: React.ReactNode;
  // ação principal da tela, à direita
  acao?: React.ReactNode;
  // linhas extras presas junto (filtros)
  children?: React.ReactNode;
};

// Barra fixa das listagens sem busca: resumo à esquerda, ação à direita. Não repete o nome da
// tela, que já está no breadcrumb; a barra diz o que se faz e o que há na tela, não onde se está.
export function BarraResumo({ titulo, resumo, acao, children }: BarraResumoProps) {
  return (
    <BarraFixa>
      <h1 className="sr-only">{titulo}</h1>
      <div className="flex items-center justify-between gap-3 py-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground">{resumo}</p>
        {acao}
      </div>
      {children}
    </BarraFixa>
  );
}
