// anel de progresso em SVG (server-friendly): trilha em muted, arco em primary, rótulo no centro
export function AnelProgresso({
  percentual,
  rotulo,
  tamanho = 128,
  espessura = 12,
}: {
  percentual: number;
  rotulo: string;
  tamanho?: number;
  espessura?: number;
}) {
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const limitado = Math.max(0, Math.min(100, percentual));

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={`${Math.round(limitado)}% ${rotulo}`}
      >
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          strokeWidth={espessura}
          className="stroke-muted"
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - limitado / 100)}
          className="stroke-primary transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{Math.round(limitado)}%</span>
        <span className="text-xs text-muted-foreground">{rotulo}</span>
      </div>
    </div>
  );
}
