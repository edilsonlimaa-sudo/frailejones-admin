"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

type AtalhosSecoesProps = {
  label: string;
  // na ordem em que as seções aparecem na página
  secoes: { id: string; label: string }[];
};

// linha, em px do topo da janela, abaixo do header e da própria barra: a seção cujo topo já passou
// por ela é a que o leitor está vendo
const LINHA_ATIVA_PX = 120;

// Barra de atalhos do celular que acompanha a rolagem: o chip da seção visível fica marcado, como
// um seletor, e a barra rola sozinha pra mantê-lo à vista. Tocar num chip rola suave até a seção
// (o deslocamento do header vem do scroll-mt da própria seção).
export function AtalhosSecoes({ label, secoes }: AtalhosSecoesProps) {
  const [ativa, setAtiva] = useState<string | null>(secoes[0]?.id ?? null);
  const lista = useRef<HTMLUListElement>(null);
  const ids = secoes.map((s) => s.id).join(",");

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const elementos = ids
        .split(",")
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);
      if (elementos.length === 0) return;

      // no fim da página a última seção pode nunca cruzar a linha: aí ela é a ativa
      const noFim = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let atual = elementos[0].id;
      if (noFim) {
        atual = elementos[elementos.length - 1].id;
      } else {
        for (const el of elementos) {
          if (el.getBoundingClientRect().top <= LINHA_ATIVA_PX) atual = el.id;
        }
      }
      setAtiva(atual);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [ids]);

  // chip ativo sempre à vista na barra, que rola na horizontal
  useEffect(() => {
    const ul = lista.current;
    const chip = ul?.querySelector<HTMLElement>(`[data-secao="${ativa}"]`);
    if (!ul || !chip) return;
    const alvo = chip.offsetLeft - (ul.clientWidth - chip.offsetWidth) / 2;
    ul.scrollTo({ left: Math.max(0, alvo), behavior: "smooth" });
  }, [ativa]);

  function irPara(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const secao = document.getElementById(id);
    if (!secao) return;
    e.preventDefault();
    secao.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav
      aria-label={label}
      className="sticky top-14 z-10 -mx-4 -mt-1 border-b bg-background/85 px-4 py-2 backdrop-blur-md lg:hidden"
    >
      <ul ref={lista} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {secoes.map((secao) => {
          const ativo = secao.id === ativa;
          return (
            <li key={secao.id} className="shrink-0">
              <a
                href={`#${secao.id}`}
                data-secao={secao.id}
                aria-current={ativo ? "location" : undefined}
                onClick={(e) => irPara(e, secao.id)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground active:bg-muted",
                )}
              >
                {secao.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
