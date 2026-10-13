"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { verificarCotacaoBcv } from "@/lib/cotacao-bcv-actions";

const INTERVALO_MS = 5 * 60_000;

// O servidor já confere a cotação a cada renderização, mas uma aba aberta desde ontem (ou desde
// antes da publicação da tarde) não renderiza de novo sozinha. Este vigia confere ao voltar pra
// aba e a cada 5 minutos com ela visível; se a cotação vigente mudou, recarrega os dados da tela.
export function VigiaCotacaoBcv({ dataVigente }: { dataVigente: string | null }) {
  const router = useRouter();
  const dataVigenteRef = useRef(dataVigente);

  useEffect(() => {
    dataVigenteRef.current = dataVigente;
  }, [dataVigente]);

  useEffect(() => {
    let verificando = false;

    const verificar = async () => {
      if (verificando || document.visibilityState !== "visible") return;
      verificando = true;
      try {
        const { dataVigente: atual } = await verificarCotacaoBcv();
        if (atual !== dataVigenteRef.current) router.refresh();
      } catch {
        // sem rede ou servidor fora: tenta de novo na próxima
      } finally {
        verificando = false;
      }
    };

    const intervalo = window.setInterval(verificar, INTERVALO_MS);
    document.addEventListener("visibilitychange", verificar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", verificar);
    };
  }, [router]);

  return null;
}
