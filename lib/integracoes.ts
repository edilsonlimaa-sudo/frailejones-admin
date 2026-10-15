import type { LucideIcon } from "lucide-react";
import { BadgeDollarSign, HardDrive, Mail, MessageCircle, Send, Smartphone, Webhook } from "lucide-react";

// Catálogo das integrações que aparecem em /integracoes. Nomes, descrições e rótulos dos campos
// ficam nas mensagens (integracoes.items.<chave>); aqui só a estrutura. Todas são de demonstração:
// a configuração é salva na tabela integracao, mas nada a usa para chamar serviços externos.

// oculta por enquanto: some da sidebar e /integracoes responde 404. Volta ligando aqui
export const INTEGRACOES_VISIVEIS = false;

export type CategoriaIntegracao = "comunicacao" | "pagamentos" | "dados";

export type CampoIntegracao = {
  nome: string;
  tipo: "text" | "password" | "email" | "url" | "tel" | "number" | "select";
  obrigatorio?: boolean;
  // só para tipo "select"; o rótulo de cada opção vem de integracoes.items.<chave>.options.<nome>.<opção>
  opcoes?: string[];
  padrao?: string;
};

export type Integracao = {
  chave: string;
  categoria: CategoriaIntegracao;
  icone: LucideIcon;
  // cor de destaque do ícone no card
  cor: string;
  campos: CampoIntegracao[];
};

export const CATEGORIAS_INTEGRACAO: CategoriaIntegracao[] = ["comunicacao", "pagamentos", "dados"];

export const INTEGRACOES: Integracao[] = [
  {
    chave: "whatsapp",
    categoria: "comunicacao",
    icone: MessageCircle,
    cor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    campos: [
      { nome: "telefone", tipo: "tel", obrigatorio: true },
      { nome: "token", tipo: "password", obrigatorio: true },
      { nome: "diasAntes", tipo: "number", padrao: "3" },
    ],
  },
  {
    chave: "email",
    categoria: "comunicacao",
    icone: Mail,
    cor: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    campos: [
      { nome: "remetente", tipo: "email", obrigatorio: true },
      { nome: "nomeRemetente", tipo: "text" },
      { nome: "apiKey", tipo: "password", obrigatorio: true },
    ],
  },
  {
    chave: "telegram",
    categoria: "comunicacao",
    icone: Send,
    cor: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    campos: [
      { nome: "botToken", tipo: "password", obrigatorio: true },
      { nome: "chatId", tipo: "text", obrigatorio: true },
    ],
  },
  {
    chave: "pagoMovil",
    categoria: "pagamentos",
    icone: Smartphone,
    cor: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    campos: [
      {
        nome: "banco",
        tipo: "select",
        obrigatorio: true,
        opcoes: ["banesco", "mercantil", "venezuela", "provincial", "bnc"],
      },
      { nome: "telefone", tipo: "tel", obrigatorio: true },
      { nome: "documento", tipo: "text", obrigatorio: true },
    ],
  },
  {
    chave: "zelle",
    categoria: "pagamentos",
    icone: BadgeDollarSign,
    cor: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    campos: [
      { nome: "emailRecebedor", tipo: "email", obrigatorio: true },
      { nome: "titular", tipo: "text", obrigatorio: true },
    ],
  },
  {
    chave: "googleDrive",
    categoria: "dados",
    icone: HardDrive,
    cor: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    campos: [
      { nome: "pasta", tipo: "text", obrigatorio: true },
      {
        nome: "frequencia",
        tipo: "select",
        obrigatorio: true,
        opcoes: ["diaria", "semanal", "mensal"],
        padrao: "semanal",
      },
    ],
  },
  {
    chave: "webhook",
    categoria: "dados",
    icone: Webhook,
    cor: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    campos: [
      { nome: "url", tipo: "url", obrigatorio: true },
      { nome: "segredo", tipo: "password" },
    ],
  },
];
