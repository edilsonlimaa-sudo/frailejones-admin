"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { useTranslations } from "next-intl";

import { COOKIE_VISAO_PAINEL, type VisaoPainel } from "@/lib/painel/visao";
import { cn } from "@/lib/utils";

const OPCOES: { visao: VisaoPainel; icone: typeof Rows3 }[] = [
  { visao: "classico", icone: Rows3 },
  { visao: "foco", icone: LayoutGrid },
];

function gravarVisaoNoCookie(visao: VisaoPainel) {
  document.cookie = `${COOKIE_VISAO_PAINEL}=${visao}; path=/; max-age=31536000; samesite=lax`;
}

// alterna entre a visão clássica e a visão foco do Dashboard; a escolha fica no cookie e o
// servidor renderiza a visão certa no refresh
export function SeletorVisao({ visao }: { visao: VisaoPainel }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const t = useTranslations("dashboard.view");

  function selecionar(proxima: VisaoPainel) {
    if (proxima === visao) return;
    gravarVisaoNoCookie(proxima);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn("inline-flex h-8 items-center rounded-full bg-muted p-0.5", pendente && "opacity-70")}
    >
      {OPCOES.map(({ visao: opcao, icone: Icone }) => {
        const ativa = opcao === visao;
        return (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => selecionar(opcao)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              ativa
                ? "bg-background text-foreground shadow-sm dark:bg-input/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-3.5" />
            {t(opcao)}
          </button>
        );
      })}
    </div>
  );
}
