import type { LucideIcon } from "lucide-react";
import { Building2, HardHat, LayoutDashboard, Receipt } from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Unidades", url: "/unidades", icon: Building2 },
  { title: "Taxas de Condomínio", url: "/taxas-condominio", icon: Receipt },
  { title: "Rateios Extraordinários", url: "/rateios-extraordinarios", icon: HardHat },
];
