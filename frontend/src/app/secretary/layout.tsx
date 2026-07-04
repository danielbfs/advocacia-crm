"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { Scale } from "lucide-react";

const NAV_ITEMS = [
  { href: "/secretary", label: "Leads" },
  { href: "/secretary/calendar", label: "Calendário" },
  { href: "/secretary/appointments", label: "Consultas" },
  { href: "/secretary/patients", label: "Clientes" },
  { href: "/secretary/doctors", label: "Advogados" },
  { href: "/secretary/shared-inbox", label: "Caixa Compartilhada" },
];

export default function SecretaryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard allowedRoles={["admin", "secretary"]}>
      <div className="min-h-screen bg-ink">
        <AppHeader />
        <div className="flex">
          <nav className="w-52 border-r border-line min-h-[calc(100vh-64px)] p-4 space-y-1">
            <div className="flex items-center gap-2.5 px-1 pb-4">
              <span className="grid size-8 place-items-center rounded-sm bg-carimbo">
                <Scale className="size-4 text-parchment" strokeWidth={1.5} />
              </span>
              <span className="font-mono text-sm tracking-[0.2em] text-parchment uppercase">
                Advoca<span className="text-carimbo">IA</span>
                <span className="text-parchment-faint"> · CRM</span>
              </span>
            </div>
            {NAV_ITEMS.map(({ href, label }) => {
              const active = href === "/secretary" ? pathname === "/secretary" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative block rounded-sm px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-ink-3 text-parchment"
                      : "text-parchment-dim hover:bg-ink-2 hover:text-parchment"
                  }`}
                >
                  {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-carimbo" />}
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 bg-ink-2/30">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
