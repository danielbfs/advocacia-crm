"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SidebarFooter() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const roleLabel =
    user.role === "admin" ? "Administrador" :
    user.role === "lawyer" ? "Advogado" :
                              "Comercial";

  return (
    <div className="border-t border-line px-3 py-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-ink-3 text-xs font-semibold text-parchment">
          {getInitials(user.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-parchment">{user.full_name}</p>
          <p className="font-mono text-[10px] tracking-wider uppercase text-parchment-faint">
            {roleLabel}
          </p>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={logout}
          aria-label="Sair"
          className="grid size-7 shrink-0 place-items-center rounded-sm text-parchment-dim transition-colors hover:bg-ink-2 hover:text-carimbo"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
