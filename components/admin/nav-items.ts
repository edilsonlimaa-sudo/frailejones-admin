import type { LucideIcon } from "lucide-react";
import { LayoutDashboard } from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
];
