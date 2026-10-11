"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, LogOut, Sprout } from "lucide-react";

import { isNavItemActive, navGroups } from "@/components/admin/nav-items";
import { useLogout } from "@/components/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

// item ativo na cor da marca, com uma barrinha à esquerda (some com a sidebar colapsada, onde o
// botão vira só o ícone). Mantém as transições de tamanho do botão base pro colapso continuar suave
const navButtonClassName = [
  "relative transition-[width,height,padding,background-color,color]",
  "before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity dark:before:bg-sidebar-primary",
  "group-data-[collapsible=icon]:before:hidden",
  "data-active:bg-primary/10 data-active:font-semibold data-active:text-primary data-active:before:opacity-100",
  "data-active:hover:bg-primary/15 data-active:hover:text-primary",
  "dark:data-active:bg-sidebar-primary/15 dark:data-active:text-sidebar-primary dark:data-active:hover:text-sidebar-primary",
  "[&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:translate-x-0.5 motion-reduce:hover:[&>svg]:translate-x-0",
].join(" ");

// "joao.silva@x.com" -> "JS"; "updmao@x.com" -> "UP"
function iniciais(email: string): string {
  const local = email.split("@")[0] ?? "";
  const partes = local.split(/[._\-+]+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : local.slice(0, 2);
  return letras.toUpperCase() || "?";
}

function Avatar({ email }: { email: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-sidebar-primary to-primary text-xs font-semibold text-sidebar-primary-foreground shadow-sm">
      {iniciais(email)}
    </span>
  );
}

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth.logout");
  const logout = useLogout();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" />}
              onClick={() => setOpenMobile(false)}
              tooltip="Frailejones"
              className="h-12 hover:bg-transparent active:bg-transparent"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-sidebar-primary to-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-primary/20">
                <Sprout />
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-semibold tracking-tight">Frailejones</span>
                <span className="truncate text-xs text-sidebar-foreground/60">{t("brandSubtitle")}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={group.labelKey ?? `group-${index}`}>
            {group.labelKey ? (
              <SidebarGroupLabel className="text-[0.68rem] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                {t(`groups.${group.labelKey}`)}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      // no mobile a sidebar é um Sheet sobreposto: fecha ao navegar (inclusive
                      // ao clicar na rota atual, que não muda o pathname)
                      onClick={() => setOpenMobile(false)}
                      isActive={isNavItemActive(pathname, item.url)}
                      tooltip={t(item.titleKey)}
                      className={navButtonClassName}
                    >
                      <item.icon />
                      <span>{t(item.titleKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={userEmail} />}>
                <Avatar email={userEmail} />
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate font-medium">{t("role")}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                    <Avatar email={userEmail} />
                    <span className="grid min-w-0 leading-tight">
                      <span className="truncate font-medium text-foreground">{t("role")}</span>
                      <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}>
                  <LogOut />
                  {tAuth("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
