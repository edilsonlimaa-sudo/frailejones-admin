"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

// Abas no visual dos chips das barras fixas (atalhos do Dashboard, filtros das listagens): fila
// que rola de lado no celular, chip ativo preenchido em verde. Usar dentro de <Tabs>/<TabsNaUrl>.
export function ListaAbasChips({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsPrimitive.List className={cn("flex w-max items-center gap-1.5", className)} {...props} />
    </div>
  );
}

export function AbaChip({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "data-active:border-primary data-active:bg-primary data-active:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}
