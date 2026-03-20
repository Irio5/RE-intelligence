"use client";

import { useState } from "react";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-mi-bg">
      {/* Sidebar — fixed on desktop, slide-in on mobile */}
      <AppSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto relative bg-mi-bg">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url('/images/Milan_map.png')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              opacity: 0.35,
            }}
          />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
