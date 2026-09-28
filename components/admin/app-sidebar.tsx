"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, CircleUserRound, LogOut } from "lucide-react";

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
} from "@/components/ui/sidebar";

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth.logout");
  const logout = useLogout();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="truncate px-2 py-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">
          Frailejones Admin
        </span>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, index) => (
          <SidebarGroup key={group.labelKey ?? `group-${index}`}>
            {group.labelKey ? (
              <SidebarGroupLabel>{t(`groups.${group.labelKey}`)}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={isNavItemActive(pathname, item.url)}
                      tooltip={t(item.titleKey)}
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={userEmail} />}>
                <CircleUserRound />
                <span className="truncate">{userEmail}</span>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{userEmail}</DropdownMenuLabel>
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
