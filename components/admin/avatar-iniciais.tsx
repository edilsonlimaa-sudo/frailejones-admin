import { cn } from "@/lib/utils";

// cores possíveis do avatar; a escolha vem do nome, então a mesma pessoa tem sempre a mesma cor
const PALETA = [
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
];

// "Carmen Rodríguez de Silva" → "CS": primeira letra do primeiro e do último nome
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${primeira}${ultima}`.toUpperCase();
}

function tomDoNome(nome: string): string {
  let hash = 0;
  for (const caractere of nome) hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0;
  return PALETA[hash % PALETA.length];
}

// bolinha com as iniciais da pessoa, no lugar de uma foto que o app não tem
export function AvatarIniciais({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide select-none",
        tomDoNome(nome),
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
