import type { LucideIcon } from "lucide-react";
import { Building2, HandCoins, HardHat, Landmark, LayoutDashboard, Receipt } from "lucide-react";

export type NavItem = {
  titleKey: "painel" | "unidades" | "taxasCondominio" | "rateiosExtraordinarios" | "liquidacoes" | "cotacaoBcv";
  url: string;
  icon: LucideIcon;
};

export type NavGroup = {
  labelKey: "cadastros" | "financeiro" | null;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  { labelKey: null, items: [{ titleKey: "painel", url: "/", icon: LayoutDashboard }] },
  {
    labelKey: "cadastros",
    items: [{ titleKey: "unidades", url: "/unidades", icon: Building2 }],
  },
  {
    labelKey: "financeiro",
    items: [
      { titleKey: "taxasCondominio", url: "/taxas-condominio", icon: Receipt },
      { titleKey: "rateiosExtraordinarios", url: "/rateios-extraordinarios", icon: HardHat },
      { titleKey: "liquidacoes", url: "/liquidacoes", icon: HandCoins },
      { titleKey: "cotacaoBcv", url: "/cotacao-bcv", icon: Landmark },
    ],
  },
];

const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

export function isNavItemActive(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

// Picks the longest matching url so nested detail routes (e.g. /unidades/123) highlight the right item.
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return navItems
    .filter((item) => isNavItemActive(pathname, item.url))
    .sort((a, b) => b.url.length - a.url.length)[0];
}
