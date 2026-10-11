"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";

import { findActiveNavItem, findNavGroup } from "@/components/admin/nav-items";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href?: string; hideOnMobile?: boolean };

// breadcrumb do header: Grupo › Seção › Detalhe. No mobile fica só a seção (a página de detalhe já
// tem o botão de voltar e o título próprio)
export function HeaderTitle() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const activeItem = findActiveNavItem(pathname);

  const crumbs: Crumb[] = [];
  if (!activeItem) {
    crumbs.push({ label: t("painel") });
  } else {
    const group = findNavGroup(activeItem);
    const isDetail = pathname !== activeItem.url;
    if (group?.labelKey) {
      crumbs.push({ label: t(`groups.${group.labelKey}`), hideOnMobile: true });
    }
    crumbs.push({ label: t(activeItem.titleKey), href: isDetail ? activeItem.url : undefined });
    if (isDetail) crumbs.push({ label: t("detail"), hideOnMobile: true });
  }

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              {index > 0 ? (
                <li
                  aria-hidden
                  className={cn(
                    "flex text-muted-foreground/60",
                    (crumbs[index - 1].hideOnMobile || crumb.hideOnMobile) && "hidden md:flex",
                  )}
                >
                  <ChevronRight className="size-3.5" />
                </li>
              ) : null}
              <li className={cn("min-w-0", crumb.hideOnMobile && "hidden md:block")}>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="block truncate font-medium text-foreground transition-colors md:font-normal md:text-muted-foreground md:hover:text-foreground"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "block truncate",
                      isLast ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
