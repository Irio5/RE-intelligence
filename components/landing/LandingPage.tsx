"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, BarChart3, Target, TrendingUp, Map, Calculator, BarChart2, Warehouse, Scale, Tag, ArrowRight, Menu, X } from "lucide-react";
import MappaContent from "@/components/dashboard/MappaContent";

// ─── Animated counter ────────────────────────────────────────────────────────

function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1400;
          const startTime = performance.now();
          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutQuart
            const eased = 1 - Math.pow(1 - progress, 4);
            setValue(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
            else setValue(end);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref}>
      {value.toLocaleString("it-IT")}
      {suffix}
    </span>
  );
}

// ─── Embedded sidebar nav ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/trend",         label: "Trend €/mq",             icon: TrendingUp },
  { href: "/mappa",         label: "Mappa prezzi",            icon: Map },
  { href: "/stima",         label: "Stima prezzo",            icon: Calculator },
  { href: "/distribuzione", label: "Distribuzione prezzi",    icon: BarChart2 },
  { href: "/comps",         label: "Transazioni Simili (Comps)", icon: Search },
  { href: "/premium",       label: "Premium garage/cantina",  icon: Warehouse },
  { href: "/confronto",     label: "Confronto zone",          icon: Scale },
  { href: "/categoria",     label: "Categoria catastale",     icon: Tag },
];

function EmbeddedSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          "bg-white border-r border-mi-border flex flex-col shrink-0",
          isOpen
            ? "fixed top-0 left-0 z-50 h-full w-[260px]"
            : "hidden md:flex md:w-[240px]",
        ].join(" ")}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-mi-border">
          <span className="text-[11px] font-semibold text-mi-subtle uppercase tracking-widest">
            Funzionalità
          </span>
          <button
            onClick={onClose}
            className="md:hidden w-7 h-7 flex items-center justify-center rounded-md text-mi-subtle hover:text-mi-text hover:bg-mi-hover transition-colors"
            aria-label="Chiudi menu"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || href === "/mappa";
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
                    <Icon size={15} strokeWidth={1.5} className={isActive ? "text-mi-primary" : "text-mi-subtle group-hover:text-mi-muted"} />
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

// ─── Main landing page ────────────────────────────────────────────────────────

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="bg-mi-bg font-sans">

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex flex-col items-center justify-start pt-[14vh] overflow-hidden"
      >
        {/* Background — mobile */}
        <div
          className="absolute inset-0 md:hidden"
          style={{
            backgroundImage: `url("/images/Brera_House_Mobile.jpg")`,
            backgroundSize: "140%",
            backgroundPosition: "center top",
          }}
        />
        {/* Background — desktop */}
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            backgroundImage: `url("/images/Brera_House.webp")`,
            backgroundSize: "cover",
            backgroundPosition: "center 0%",
          }}
        />
        {/* Subtle uniform overlay for text legibility */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(250,249,246,0.25)" }}
        />
        {/* Bottom fade to background */}
        <div
          className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent 0%, #FAF9F6 100%)" }}
        />
        {/* Sepia tint */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(180,130,90,0.08)", mixBlendMode: "multiply" }}
        />

        {/* Top navbar with logo */}
        <div className="absolute top-0 inset-x-0 z-20 flex justify-center py-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Logo_RE.png" alt="RE Intelligence" className="h-40 sm:h-44 md:h-[220px] w-auto" style={{ background: "transparent" }} />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          {/* Eyebrow */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-mi-border bg-white/70 backdrop-blur-sm text-[12px] font-medium text-mi-muted mb-2 animate-fade-in-up mt-16"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-mi-primary inline-block" />
            Analisi basata su dati OMI reali · Milano
          </div>

          {/* Headline */}
          <h1
            className="font-display text-[36px] sm:text-[52px] leading-[1.05] text-mi-text mb-6 animate-fade-in-up"
            style={{ animationDelay: "0.15s" }}
          >
            Compra casa<br />
            <span className="text-mi-primary">al prezzo giusto</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-[17px] sm:text-[19px] text-mi-muted leading-relaxed mb-10 max-w-xl mx-auto animate-fade-in-up"
            style={{ animationDelay: "0.28s" }}
          >
            Analisi basata su 18.000+ transazioni reali a Milano.
            Prezzi, trend, comparabili —{" "}
            <span className="text-mi-text font-medium">dati, non opinioni.</span>
          </p>

          {/* CTA */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up"
            style={{ animationDelay: "0.4s" }}
          >
            <a
              href="#dashboard"
              className="inline-flex items-center justify-center gap-2 h-12 px-7 w-full sm:w-auto rounded-xl bg-mi-primary text-white text-[15px] font-semibold
                         hover:bg-mi-primary-dark transition-colors duration-150 shadow-card-md"
            >
              Inizia l&apos;analisi
              <ArrowRight size={16} strokeWidth={2} />
            </a>
            <a
              href="#come-funziona"
              className="inline-flex items-center justify-center gap-2 h-12 px-6 w-full sm:w-auto rounded-xl border border-mi-border bg-white/70 backdrop-blur-sm
                         text-[15px] font-medium text-mi-muted hover:bg-white hover:text-mi-text transition-all duration-150"
            >
              Come funziona
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce opacity-40">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-mi-muted">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────────────── */}
      <section className="bg-mi-stats border-t-2 border-mi-primary/20 py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { value: 18499, suffix: "", label: "transazioni analizzate", note: "2021–2025" },
            { value: 40,    suffix: "+", label: "zone OMI coperte",      note: "tutta Milano" },
            { value: 5,     suffix: " anni", label: "di storico",        note: "2021 → 2025" },
          ].map(({ value, suffix, label, note }) => (
            <div key={label} className="text-center">
              <p className="font-display text-[42px] sm:text-[48px] leading-none text-mi-text mb-1">
                <Counter end={value} suffix={suffix} />
              </p>
              <p className="text-[15px] font-medium text-mi-muted">{label}</p>
              <p className="text-[12px] text-mi-subtle mt-0.5">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COME FUNZIONA ─────────────────────────────────────────────────────── */}
      <section id="come-funziona" className="py-24 px-6 bg-mi-bg">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[11px] font-semibold text-mi-primary uppercase tracking-widest mb-3">
              Come funziona
            </p>
            <h2 className="font-display text-[36px] sm:text-[42px] text-mi-text leading-tight">
              Dati reali, decisioni migliori
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                step: "01",
                title: "Scegli la zona",
                desc: "Seleziona la zona OMI e i parametri dell'immobile che stai valutando.",
              },
              {
                icon: BarChart3,
                step: "02",
                title: "Analizza i dati",
                desc: "Esplora trend storici, distribuzioni di prezzo e transazioni comparabili.",
              },
              {
                icon: Target,
                step: "03",
                title: "Negozia con i dati",
                desc: "Usa le prove oggettive per sapere se il prezzo richiesto è equo e per negoziare.",
              },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="relative">
                <div className="w-12 h-12 rounded-2xl bg-mi-active-bg flex items-center justify-center mb-5">
                  <Icon size={20} strokeWidth={1.5} className="text-mi-primary" />
                </div>
                <p className="text-[11px] font-semibold text-mi-subtle uppercase tracking-wider mb-2">
                  Step {step}
                </p>
                <h3 className="text-[18px] font-semibold text-mi-text mb-2">{title}</h3>
                <p className="text-[14px] text-mi-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIVISORE ────────────────────────────────────────────────────────── */}
      <div className="h-px bg-mi-border mx-6" />

      {/* ── DASHBOARD SECTION ─────────────────────────────────────────────────── */}
      <section id="dashboard">
        {/* Dashboard mini-header */}
        <div className="h-24 bg-white border-b border-mi-border flex items-center px-4 sm:px-5 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-md text-mi-subtle hover:text-mi-text hover:bg-mi-hover transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Menu"
            >
              <Menu size={19} strokeWidth={1.5} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Logo_RE.png" alt="RE Intelligence" className="h-20 sm:h-[80px] w-auto" style={{ background: "transparent" }} />
          </div>
          <div className="ml-auto">
            <Link
              href="/trend"
              className="hidden md:flex text-[13px] font-medium text-mi-muted hover:text-mi-primary transition-colors duration-150 items-center gap-1.5"
            >
              Apri a schermo intero
              <ArrowRight size={13} strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        {/* Dashboard body: sidebar + content */}
        <div className="flex" style={{ minHeight: "calc(100vh - 96px)" }}>
          <EmbeddedSidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
          <div className="flex-1 min-w-0 overflow-x-auto relative bg-mi-bg">
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
            <div className="relative z-10">
              <MappaContent />
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-mi-border py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Logo_RE.png" alt="RE Intelligence" className="h-20 sm:h-[80px] w-auto" style={{ background: "transparent" }} />
          <p className="text-[12px] text-mi-subtle text-center">
            Dati OMI 2021–2025 · Solo Milano · Beta
          </p>
        </div>
      </footer>

    </div>
  );
}
