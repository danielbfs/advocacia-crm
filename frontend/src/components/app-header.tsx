"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Branding {
  name: string;
  logo_url: string;
}

const ADMIN_VIEWS = [
  { href: "/admin",     label: "Administração" },
  { href: "/secretary", label: "Comercial"     },
  { href: "/doctor",    label: "Advogado"      },
];

function currentViewLabel(pathname: string): string {
  if (pathname.startsWith("/admin"))     return "Administração";
  if (pathname.startsWith("/secretary")) return "Comercial";
  if (pathname.startsWith("/doctor"))    return "Advogado";
  return "";
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [branding, setBranding] = useState<Branding>({ name: "Open Clinic AI", logo_url: "" });

  useEffect(() => {
    api.get("/admin/branding").then(({ data }) => setBranding(data)).catch(() => {});
  }, []);

  if (!user) return null;

  const roleLabel =
    user.role === "admin"  ? "Administrador" :
    user.role === "doctor" ? "Advogado"      :
                             "Comercial";

  const homeHref =
    user.role === "admin"  ? "/admin"     :
    user.role === "doctor" ? "/doctor"    :
                             "/secretary";

  const displayName = branding.name || "Open Clinic AI";
  const viewLabel   = currentViewLabel(pathname);

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-ink/80 backdrop-blur px-6 flex items-center justify-between h-16">

      {/* ── Logo + badge de role ── */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.push(homeHref)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {branding.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={displayName} className="h-8 w-auto object-contain" />
          )}
          <span className="font-display font-semibold text-parchment">{displayName}</span>
        </button>

        {/* Badge de role (sempre visível) */}
        <span className="font-mono text-[10px] tracking-wider uppercase bg-ink-2 text-parchment-dim px-2 py-0.5 rounded-sm">
          {roleLabel}
        </span>

        {/* Badge de visão atual — só admin ao navegar em outras visões */}
        {user.role === "admin" && viewLabel && viewLabel !== "Administração" && (
          <span className="flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase bg-carimbo/10 text-carimbo-bright px-2 py-0.5 rounded-sm">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Visão: {viewLabel}
          </span>
        )}
      </div>

      {/* ── Atalhos de visão (só admin) ── */}
      {user.role === "admin" && (
        <nav className="flex items-center h-full">
          {ADMIN_VIEWS.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`
                  h-full flex items-center px-5 text-sm font-medium border-b-2 transition-colors
                  ${active
                    ? "border-carimbo text-parchment bg-ink-3/60"
                    : "border-transparent text-parchment-dim hover:text-parchment hover:bg-ink-2"}
                `}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* ── Ações do usuário ── */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-sm text-parchment-dim hidden sm:inline">{user.full_name}</span>
        <button
          onClick={() => router.push("/change-password")}
          className="text-sm text-parchment-dim hover:text-parchment transition-colors"
        >
          Alterar Senha
        </button>
        <button
          onClick={logout}
          className="text-sm text-parchment-dim hover:text-carimbo transition-colors"
        >
          Sair
        </button>
      </div>
    </header>
  );
}
