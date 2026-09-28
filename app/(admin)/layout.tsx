import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/admin/app-sidebar";
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
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <HeaderTitle />
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
