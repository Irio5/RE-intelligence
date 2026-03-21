"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

type Props = {
  onMenuClick: () => void;
};

export default function AppHeader({ onMenuClick }: Props) {
  return (
    <header className="h-24 lg:h-28 shrink-0 flex items-center justify-between px-4 lg:px-5 bg-white border-b border-mi-border relative z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md text-mi-subtle hover:text-mi-text hover:bg-mi-hover transition-colors duration-150 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Menu"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <Link href="/" className="flex items-center group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Logo_RE.png" alt="RE Intelligence" className="h-20 lg:h-24 w-auto" style={{ background: "transparent" }} />
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-sm text-mi-subtle px-3 py-1.5 rounded-lg hover:bg-mi-hover cursor-default transition-colors">
          Milano
        </span>
        <div className="w-7 h-7 rounded-full bg-mi-hover border border-mi-border flex items-center justify-center text-[11px] font-semibold text-mi-muted cursor-default">
          U
        </div>
      </div>
    </header>
  );
}
