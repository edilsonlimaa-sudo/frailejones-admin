import { cn } from "@/lib/utils";

// Barra de vidro presa logo abaixo do header do app, o "header duplo" das listagens e do
// Dashboard: o que orienta a página (título, mês, busca, filtros) continua à vista enquanto o
// conteúdo rola por baixo, com o mesmo desfoque do header. Precisa ser o primeiro filho do
// <main> (p-4): as margens negativas encostam a barra nas bordas e no header.
export function BarraFixa({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky top-14 z-10 -mx-4 -mt-4 border-b bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      {children}
    </div>
  );
}
