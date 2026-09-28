import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ModeToggle } from "@/components/mode-toggle";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("portal");

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{t("brandName")}</p>
            <p className="text-xs text-muted-foreground">{t("brandTagline")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ModeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 py-10 sm:py-14">{children}</main>
      <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">{t("footer")}</footer>
    </div>
  );
}
