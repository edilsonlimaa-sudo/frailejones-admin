"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type ReactNode, type TouchEvent } from "react";

import { cn } from "@/lib/utils";

// quanto o dedo precisa andar na horizontal, e em quanto tempo, pra contar como gesto de troca
const DISTANCIA_MINIMA_PX = 64;
const DURACAO_MAXIMA_MS = 700;

type DeslizarMesProps = {
  anteriorHref: string;
  seguinteHref: string;
  children: ReactNode;
};

// o gesto é ignorado quando começa em algo que já rola na horizontal (chips, abas) ou num gráfico,
// que usa o arrasto pra mostrar o tooltip
function comecaEmAreaDeArrasto(alvo: EventTarget | null, limite: HTMLElement): boolean {
  if (!(alvo instanceof Element)) return false;
  if (alvo.closest(".recharts-wrapper, [data-sem-deslizar]")) return true;
  for (let el: Element | null = alvo; el && el !== limite; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

// Troca de mês por gesto no celular: arrastar pra esquerda vai pro mês seguinte, pra direita volta
// ao anterior, como num calendário. Só reage a toque (touch events): no desktop as setas bastam.
// Os dois meses vizinhos são pré-carregados pra troca sair na hora.
export function DeslizarMes({ anteriorHref, seguinteHref, children }: DeslizarMesProps) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number; em: number } | null>(null);

  useEffect(() => {
    router.prefetch(anteriorHref);
    router.prefetch(seguinteHref);
  }, [router, anteriorHref, seguinteHref]);

  function aoTocar(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1 || !raiz.current || comecaEmAreaDeArrasto(e.target, raiz.current)) {
      inicio.current = null;
      return;
    }
    const toque = e.touches[0];
    inicio.current = { x: toque.clientX, y: toque.clientY, em: Date.now() };
  }

  function aoSoltar(e: TouchEvent<HTMLDivElement>) {
    const partida = inicio.current;
    inicio.current = null;
    if (!partida || Date.now() - partida.em > DURACAO_MAXIMA_MS) return;

    const toque = e.changedTouches[0];
    const dx = toque.clientX - partida.x;
    const dy = toque.clientY - partida.y;
    // precisa ser claramente horizontal, senão é rolagem da página
    if (Math.abs(dx) < DISTANCIA_MINIMA_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    startTransition(() => router.push(dx < 0 ? seguinteHref : anteriorHref));
  }

  return (
    <div
      ref={raiz}
      onTouchStart={aoTocar}
      onTouchEnd={aoSoltar}
      className={cn("transition-opacity", pendente && "opacity-60")}
    >
      {children}
    </div>
  );
}
