"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";

const NAV_ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/doctors", label: "Médicos / Agendas" },
  { href: "/admin/specialties", label: "Especialidades" },
  { href: "/admin/chatbot", label: "Chatbot / IA" },
  { href: "/admin/ia-comercial", label: "IA Comercial" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
  { href: "/admin/follow-ups", label: "Follow-ups" },
  { href: "/admin/users", label: "Usuários" },
  { href: "/admin/reports", label: "Relatórios" },
  { href: "/admin/setup", label: "Configurações" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="flex">
          <nav className="w-52 bg-white border-r min-h-[calc(100vh-64px)] p-4 space-y-1">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
