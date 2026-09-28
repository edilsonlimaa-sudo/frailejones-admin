import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PortalLookupForm } from "@/components/portal/portal-lookup-form";

export default async function PortalHomePage() {
  const t = await getTranslations("portal.lookup");

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PortalLookupForm />
    </div>
  );
}
