import { cn } from "@/lib/utils";
import { MedidorBarraFixa } from "@/components/admin/medidor-barra-fixa";

// classes do vidro, pra outros elementos presos (cabeçalhos de dia) terem o mesmo acabamento
export const VIDRO = "border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70";

// o que gruda abaixo da barra usa este top: header do app (3.5rem) + a altura medida da barra
export const TOP_ABAIXO_DA_BARRA = "calc(3.5rem + var(--barra-fixa-altura, 0px))";

// Barra de vidro presa logo abaixo do header do app, o "header duplo" das listagens e do
// Dashboard: o que orienta a página (título, mês, busca, filtros) continua à vista enquanto o
// conteúdo rola por baixo, com o mesmo desfoque do header. Precisa ser o primeiro filho do
// <main> (p-4): as margens negativas encostam a barra nas bordas e no header.
export function BarraFixa({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("sticky top-14 z-10 -mx-4 -mt-4 px-4", VIDRO, className)}>
      <MedidorBarraFixa />
      {children}
    </div>
  );
}
