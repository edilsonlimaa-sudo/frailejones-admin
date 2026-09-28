"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { findActiveNavItem } from "@/components/admin/nav-items";

export function HeaderTitle() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const activeItem = findActiveNavItem(pathname);

  return <span className="text-sm font-medium">{activeItem ? t(activeItem.titleKey) : t("painel")}</span>;
}
