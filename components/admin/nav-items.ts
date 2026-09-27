import type { LucideIcon } from "lucide-react";
import { Building2, HandCoins, HardHat, Landmark, LayoutDashboard, Receipt } from "lucide-react";

export type NavItem = {
  titleKey: "painel" | "unidades" | "taxasCondominio" | "rateiosExtraordinarios" | "liquidacoes" | "cotacaoBcv";
  url: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { titleKey: "painel", url: "/", icon: LayoutDashboard },
  { titleKey: "unidades", url: "/unidades", icon: Building2 },
  { titleKey: "taxasCondominio", url: "/taxas-condominio", icon: Receipt },
  { titleKey: "rateiosExtraordinarios", url: "/rateios-extraordinarios", icon: HardHat },
  { titleKey: "liquidacoes", url: "/liquidacoes", icon: HandCoins },
  { titleKey: "cotacaoBcv", url: "/cotacao-bcv", icon: Landmark },
];
