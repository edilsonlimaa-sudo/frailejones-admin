"use client";

import { useEffect, useRef } from "react";

// Publica a altura da barra fixa em --barra-fixa-altura (no <html>), pra quem precisa grudar logo
// abaixo dela (cabeçalhos de dia, por exemplo) sem conhecer quantas linhas ela tem. Acompanha
// mudanças de tamanho (filtros que aparecem, quebra de linha no celular).
export function MedidorBarraFixa() {
  const marcador = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const barra = marcador.current?.parentElement;
    if (!barra) return;
    const raiz = document.documentElement;
    const aplicar = () => raiz.style.setProperty("--barra-fixa-altura", `${barra.offsetHeight}px`);
    aplicar();
    const observador = new ResizeObserver(aplicar);
    observador.observe(barra);
    return () => {
      observador.disconnect();
      raiz.style.removeProperty("--barra-fixa-altura");
    };
  }, []);

  return <span ref={marcador} hidden />;
}
