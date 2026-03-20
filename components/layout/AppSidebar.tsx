"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp, Map, Calculator, BarChart2,
  Search, Warehouse, Scale, Tag, X,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/trend",         label: "Trend €/mq",             icon: TrendingUp },
  { href: "/mappa",         label: "Mappa prezzi",            icon: Map },
  { href: "/stima",         label: "Stima prezzo",            icon: Calculator },
  { href: "/distribuzione", label: "Distribuzione prezzi",    icon: BarChart2 },
  { href: "/comps",         label: "Comps",                   icon: Search },
  { href: "/premium",       label: "Premium garage/cantina",  icon: Warehouse },
  { href: "/confronto",     label: "Confronto zone",          icon: Scale },
  { href: "/categoria",     label: "Categoria catastale",     icon: Tag },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AppSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/15 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          "fixed top-0 left-0 z-40 h-full w-[260px] flex flex-col",
          "bg-white border-r border-mi-border",
          "transform transition-transform duration-200 ease-in-out",
          "lg:relative lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Mirror header height */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-mi-border shrink-0">
          <span className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest">
            Funzionalità
          </span>
          <button
            onClick={onClose}
            className="lg:hidden w-6 h-6 flex items-center justify-center rounded-md text-mi-subtle hover:text-mi-text hover:bg-mi-hover transition-colors"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={[
                      "group flex items-center gap-3 px-3 py-2.5 rounded-xl",
                      "text-[13.5px] font-medium transition-all duration-150",
                      isActive
                        ? "bg-mi-active-bg text-mi-primary border-l-2 border-mi-primary pl-[10px]"
                        : "text-mi-muted hover:bg-mi-hover hover:text-mi-text border-l-2 border-transparent pl-[10px]",
                    ].join(" ")}
                  >
                    <Icon
                      size={15}
                      strokeWidth={1.5}
                      className={isActive ? "text-mi-primary" : "text-mi-subtle group-hover:text-mi-muted"}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-5 py-4 border-t border-mi-divider">
          <p className="text-[11px] text-mi-subtle">Dati OMI · Milano · 2021–2025</p>
        </div>
      </aside>
    </>
  );
}
