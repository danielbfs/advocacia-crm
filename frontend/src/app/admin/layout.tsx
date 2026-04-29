"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AppHeader } from "@/components/app-header";
import { useTier } from "@/lib/tier";
import { 
  LayoutDashboard, Calendar, Users, Inbox, Bot, BrainCircuit, Clock,
  PieChart, UserCircle, Stethoscope, Activity, Shield, MessageCircle, Settings,
  LucideIcon
} from "lucide-react";

type NavItem = 
  | { href: string; label: string; icon: LucideIcon; advancedOnly?: boolean; heading?: never }
  | { heading: string; href?: never; label?: never; icon?: never; advancedOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Agenda da Clínica", icon: Calendar },
  { href: "/admin/leads", label: "Leads", icon: Users },

  { heading: "Automações" },
  { href: "/admin/shared-inbox", label: "Caixa Compartilhada", icon: Inbox },
  { href: "/admin/chatbot", label: "Chatbot / IA", icon: Bot },
  { href: "/admin/ia-comercial", label: "Atendente IA", icon: BrainCircuit },
  { href: "/admin/follow-ups", label: "Follow-ups", icon: Clock },
  
  { heading: "Relatórios" },
  { href: "/admin/reports", label: "Funil de Leads", icon: PieChart },
  
  { heading: "Cadastros" },
  { href: "/admin/patients", label: "Pacientes", icon: UserCircle },
  { href: "/admin/doctors", label: "Médicos", icon: Stethoscope },
  { href: "/admin/specialties", label: "Especialidades", icon: Activity },
  { href: "/admin/users", label: "Usuários", icon: Shield },
  
  { heading: "Sistema" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/setup", label: "Configurações", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tier } = useTier();

  const filteredNavItems = NAV_ITEMS.filter((item) => {
    if (tier === "basic" && item.advancedOnly) return false;
    return true;
  });

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <div className="min-h-screen bg-background flex flex-col font-sans">
        {tier !== "basic" && <AppHeader />}
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-64 bg-sidebar text-sidebar-text shadow-xl flex flex-col z-10">
            <div className="p-6">
              <h1 className="text-2xl font-bold text-white tracking-tight">Open<span className="text-primary-400 font-light">Clinic</span></h1>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-1 custom-scrollbar">
              {filteredNavItems.map((item, idx) => {
                if (item.heading) {
                  return (
                    <div key={`h-${idx}`} className="pt-6 pb-2 px-3 text-[11px] font-bold text-sidebar-muted uppercase tracking-widest opacity-80">
                      {item.heading}
                    </div>
                  );
                }
                const { href, label, icon: Icon } = item;
                const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href as string);
                return (
                  <Link
                    key={href}
                    href={href as string}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${
                      active
                        ? "bg-sidebar-hover text-white font-semibold shadow-inner"
                        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
                    }`}
                  >
                    {Icon && <Icon size={18} className={active ? "text-primary-400" : "text-sidebar-muted group-hover:text-white transition-colors"} />}
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}

