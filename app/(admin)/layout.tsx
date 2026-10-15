import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/admin/app-sidebar";
import { BcvChip } from "@/components/admin/bcv-chip";
import { HeaderTitle } from "@/components/admin/header-title";
import { createClient } from "@/lib/supabase/server";
import { ModeToggle } from "@/components/mode-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar userEmail={data.claims.email ?? ""} />
      {/* min-w-0: conteúdo largo (abas, tabelas) rola dentro dele em vez de alargar a página */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4 data-vertical:self-center" />
          <HeaderTitle />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <BcvChip />
            <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-center max-sm:hidden" />
            <LocaleSwitcher />
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
