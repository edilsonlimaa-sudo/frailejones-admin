import type { EstadoMesConta } from "@/lib/estado-de-cuenta";

// cores da situação de uma cobrança, compartilhadas pela linha do tempo do estado de conta e pela
// lista de cobranças: verde = em dia, âmbar = pagou atrasado, vermelho = vencido, cinza = a vencer
export const COR_ESTADO_COBRANCA: Record<EstadoMesConta | "cancelado", string> = {
  enDia: "bg-primary",
  conAtraso: "bg-amber-500",
  vencido: "bg-destructive",
  porVencer: "bg-muted border border-muted-foreground/40",
  sinCobros: "border border-dashed border-border",
  cancelado: "bg-muted-foreground/30",
};
