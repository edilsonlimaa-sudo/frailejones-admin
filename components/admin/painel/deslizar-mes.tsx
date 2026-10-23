"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
  type TransitionEvent,
} from "react";

// quanto o dedo precisa andar na horizontal, e em quanto tempo, pra contar como gesto de troca
const DISTANCIA_MINIMA_PX = 64;
const DURACAO_MAXIMA_MS = 700;
// a partir de quantos px o gesto se define como horizontal ou vertical
const TRAVA_DIRECAO_PX = 10;
// enquanto arrasta, o conteúdo acompanha o dedo com resistência, até este limite
const RESISTENCIA = 0.4;
const ARRASTO_MAXIMO_PX = 96;
// quanto o conteúdo sai pro lado ao trocar, e de onde o novo entra
const SALTO_PX = 56;

type DeslizarMesProps = {
  anteriorHref: string;
  seguinteHref: string;
  children: ReactNode;
};

// 1 = foi pro mês seguinte (o conteúdo sai pela esquerda), -1 = voltou pro anterior
type Direcao = 1 | -1;

type Fase =
  | { tipo: "parado" }
  | { tipo: "arrastando"; dx: number }
  | { tipo: "saindo"; direcao: Direcao }
  | { tipo: "entrando"; direcao: Direcao; etapa: "inicio" | "fim" };

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

// preferência do aparelho, acompanhada ao vivo; no servidor vale "sem restrição"
const consultaReduzirMovimento = () => matchMedia("(prefers-reduced-motion: reduce)");
function assinarReduzirMovimento(aoMudar: () => void) {
  const consulta = consultaReduzirMovimento();
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

// com "reduzir movimento" ligado no aparelho, nada se desloca: só o esmaecer marca a troca
function estiloDaFase(fase: Fase, reduzirMovimento: boolean): CSSProperties {
  const deslocar = (px: number) => (reduzirMovimento ? undefined : `translateX(${px}px)`);
  switch (fase.tipo) {
    case "parado":
      // volta suave de um arrasto que não virou troca
      return { transition: "transform 200ms ease-out, opacity 200ms ease-out" };
    case "arrastando":
      return { transform: deslocar(fase.dx), transition: "none" };
    case "saindo":
      return {
        transform: deslocar(-fase.direcao * SALTO_PX),
        opacity: 0,
        transition: "transform 180ms ease-in, opacity 180ms ease-in",
      };
    case "entrando":
      return fase.etapa === "inicio"
        ? { transform: deslocar(fase.direcao * SALTO_PX), opacity: 0, transition: "none" }
        : {
            transform: deslocar(0),
            opacity: 1,
            transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out",
          };
  }
}

// Troca de mês por gesto no celular: arrastar pra esquerda vai pro mês seguinte, pra direita volta
// ao anterior, como num calendário. Só reage a toque (touch events): no desktop as setas bastam.
// O movimento é visível: enquanto o dedo arrasta, o conteúdo o acompanha com resistência; ao
// soltar, o mês atual sai pelo lado do gesto e, quando o mês novo chega, entra pelo lado oposto.
// Um arrasto curto demais volta ao lugar. Os dois meses vizinhos são pré-carregados pra troca
// sair na hora.
export function DeslizarMes({ anteriorHref, seguinteHref, children }: DeslizarMesProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fase, setFase] = useState<Fase>({ tipo: "parado" });
  const reduzirMovimento = useSyncExternalStore(
    assinarReduzirMovimento,
    () => consultaReduzirMovimento().matches,
    () => false,
  );
  const raiz = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number; em: number } | null>(null);
  const direcaoTravada = useRef<"horizontal" | "vertical" | null>(null);
  // direção do gesto que disparou a navegação, consumida quando o mês novo chega
  const direcaoPendente = useRef<Direcao | null>(null);

  useEffect(() => {
    router.prefetch(anteriorHref);
    router.prefetch(seguinteHref);
  }, [router, anteriorHref, seguinteHref]);

  // o mês novo chegou (as rotas vizinhas mudaram) depois de um gesto: entra pelo lado oposto ao
  // que o antigo saiu. Dois quadros: um pra pintar na posição inicial, outro pra animar até o lugar
  useLayoutEffect(() => {
    const direcao = direcaoPendente.current;
    if (!direcao) return;
    direcaoPendente.current = null;
    setFase({ tipo: "entrando", direcao, etapa: "inicio" });
    let quadro = requestAnimationFrame(() => {
      quadro = requestAnimationFrame(() => setFase({ tipo: "entrando", direcao, etapa: "fim" }));
    });
    return () => cancelAnimationFrame(quadro);
  }, [anteriorHref, seguinteHref]);

  function aoTocar(e: TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1 || !raiz.current || comecaEmAreaDeArrasto(e.target, raiz.current)) {
      inicio.current = null;
      return;
    }
    const toque = e.touches[0];
    inicio.current = { x: toque.clientX, y: toque.clientY, em: Date.now() };
    direcaoTravada.current = null;
  }

  function aoMover(e: TouchEvent<HTMLDivElement>) {
    const partida = inicio.current;
    if (!partida) return;
    const toque = e.touches[0];
    const dx = toque.clientX - partida.x;
    const dy = toque.clientY - partida.y;

    if (direcaoTravada.current === null) {
      if (Math.abs(dx) < TRAVA_DIRECAO_PX && Math.abs(dy) < TRAVA_DIRECAO_PX) return;
      direcaoTravada.current = Math.abs(dx) > Math.abs(dy) * 1.5 ? "horizontal" : "vertical";
    }
    if (direcaoTravada.current !== "horizontal") return;

    const arrasto = Math.max(-ARRASTO_MAXIMO_PX, Math.min(ARRASTO_MAXIMO_PX, dx * RESISTENCIA));
    setFase({ tipo: "arrastando", dx: arrasto });
  }

  function aoSoltar(e: TouchEvent<HTMLDivElement>) {
    const partida = inicio.current;
    inicio.current = null;
    if (!partida) return;

    const toque = e.changedTouches[0];
    const dx = toque.clientX - partida.x;
    const dy = toque.clientY - partida.y;
    const valido =
      Date.now() - partida.em <= DURACAO_MAXIMA_MS &&
      Math.abs(dx) >= DISTANCIA_MINIMA_PX &&
      // precisa ser claramente horizontal, senão é rolagem da página
      Math.abs(dx) >= Math.abs(dy) * 1.5;
    if (!valido) {
      setFase({ tipo: "parado" });
      return;
    }

    const direcao: Direcao = dx < 0 ? 1 : -1;
    direcaoPendente.current = direcao;
    setFase({ tipo: "saindo", direcao });
    startTransition(() => router.push(direcao === 1 ? seguinteHref : anteriorHref));
  }

  function aoCancelar() {
    inicio.current = null;
    setFase({ tipo: "parado" });
  }

  // terminou de entrar: limpa o estilo em linha pra página voltar ao normal (sem transform)
  function aoTerminarTransicao(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (fase.tipo === "entrando" && fase.etapa === "fim") setFase({ tipo: "parado" });
  }

  return (
    <div
      ref={raiz}
      onTouchStart={aoTocar}
      onTouchMove={aoMover}
      onTouchEnd={aoSoltar}
      onTouchCancel={aoCancelar}
      onTransitionEnd={aoTerminarTransicao}
      style={estiloDaFase(fase, reduzirMovimento)}
    >
      {children}
    </div>
  );
}
