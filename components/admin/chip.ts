import { cn } from "@/lib/utils";

// Chip das barras fixas (atalhos do Dashboard, filtros de situação das unidades): pílula pequena,
// preenchida em verde quando é a ativa. Um só lugar pra todos os chips do app ficarem iguais.
export function classesDoChip(ativo: boolean, className?: string): string {
  return cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
    ativo
      ? "border-primary bg-primary text-primary-foreground"
      : "bg-card text-muted-foreground hover:text-foreground active:bg-muted",
    className,
  );
}
