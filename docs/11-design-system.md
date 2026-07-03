---
tags: [advocacia-crm, design-system, ui]
created: 2026-07-02
status: aguardando-aprovacao
---

# Design System "Cartório Noturno" — AdvocacIA CRM

Identidade visual **idêntica** à do AdvocacIA GED (`D:\Projetos\AdvocacIA`), portada do stack de lá (Vite + Tailwind v4 `@theme`) para o stack daqui (Next.js 14 + Tailwind v3 `tailwind.config.ts`). Este documento contém os valores exatos — não invente variações.

---

## 1. Conceito

Tema escuro editorial que remete a um cartório à noite: papel-pergaminho sobre tinta escura, carimbo vermelho como acento de ação, selo dourado como acento secundário. Cantos quase retos (`rounded-sm` = 2px), tipografia serifada para títulos, monoespaçada para etiquetas/metadados em uppercase com tracking largo.

---

## 2. Tokens de cor

Valores canônicos (copiados de `AdvocacIA/frontend/src/index.css`):

| Token | Hex | Uso |
|---|---|---|
| `ink` | `#16140f` | Fundo principal (body, sidebar) |
| `ink-2` | `#211d16` | Fundo elevado (cards, painéis, inputs) |
| `ink-3` | `#2c2720` | Fundo hover / item ativo |
| `line` | `#3a342b` | TODAS as bordas e divisores |
| `parchment` | `#ede6d6` | Texto principal |
| `parchment-dim` | `#b3a993` | Texto secundário |
| `parchment-faint` | `#6f685a` | Texto terciário, placeholders |
| `carimbo` | `#d6492f` | Ação primária, item ativo, destaque da marca |
| `carimbo-bright` | `#e85c42` | Hover da ação primária, texto de erro |
| `selo` | `#b8915a` | Acento secundário (dourado — etiquetas, selos, hovers sutis) |
| `info` | `#3e5c6b` | Estados informativos |
| `jade` | `#5b8a72` | Sucesso / positivo |

### `frontend/tailwind.config.ts` (substituir o `theme.extend` atual)

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16140f", 2: "#211d16", 3: "#2c2720" },
        line: "#3a342b",
        parchment: { DEFAULT: "#ede6d6", dim: "#b3a993", faint: "#6f685a" },
        carimbo: { DEFAULT: "#d6492f", bright: "#e85c42" },
        selo: "#b8915a",
        info: "#3e5c6b",
        jade: "#5b8a72",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
```

> Nota: classes ficam `bg-ink`, `bg-ink-2`, `text-parchment-dim`, `border-line`, `bg-carimbo`, `hover:bg-carimbo-bright`, `text-selo`, `animate-rise` — os mesmos nomes usados no código do GED, o que permite copiar JSX de lá quase sem adaptação.

---

## 3. Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display | **Spectral** (400, 500, 600, 700 + itálicas) | Títulos de página e headline do login (`font-display`) |
| Texto | **Inter** (400, 500, 600, 700) | Corpo, formulários, tabelas (`font-sans`) |
| Mono | **JetBrains Mono** (400, 500, 700) | Etiquetas uppercase, códigos de lead, metadados (`font-mono`) |

### `frontend/src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Spectral, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AdvocacIA CRM — Gestão Comercial",
  description:
    "CRM comercial para escritórios de advocacia: leads, pipeline de vendas e atendimento com IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${spectral.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

### `frontend/src/app/globals.css` (substituir por completo)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  background-color: #16140f; /* ink */
  color: #ede6d6; /* parchment */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

::selection {
  background: #d6492f; /* carimbo */
  color: #fff;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 4. Padrões de componente

Regras que valem para todo o app (idênticas ao GED):

- **Raio:** `rounded-sm` (2px) em tudo — botões, cards, inputs. Nunca `rounded-xl`/`rounded-lg`.
- **Bordas:** sempre `border-line`; nada de sombras coloridas. Sombra permitida: `shadow-[0_1px_0_0_rgba(0,0,0,0.4)]` no botão primário.
- **Botão primário:** `bg-carimbo text-parchment hover:bg-carimbo-bright active:translate-y-px rounded-sm text-sm font-semibold`.
- **Botão secundário:** `border border-line bg-ink/40 hover:border-selo/50 hover:bg-ink-3`.
- **Input:** fundo `ink` a 60%, borda `line`, foco = borda + ring de 1px `carimbo` (sem ring azul). Placeholder `parchment-faint`.
- **Etiqueta de formulário:** `font-mono text-[10px] tracking-[0.2em] uppercase text-parchment-dim`.
- **Card/painel:** `rounded-sm border border-line bg-ink-2/30` (ou `bg-ink-2` sólido para modais).
- **Ícones:** lucide-react com `strokeWidth={1.5}`.
- **Erro:** `rounded-sm border border-carimbo/40 bg-carimbo/10 text-carimbo-bright`.
- **Sucesso:** usar `jade`. **Info:** usar `info`. **Aviso/pendente:** usar `selo`.
- **Kanban de leads:** colunas com cabeçalho `font-mono uppercase tracking-wider text-parchment-dim`, cartões `border-line bg-ink-2`, valor da proposta em `text-selo font-mono`.
- **Entrada de página:** wrapper com `animate-rise` (delays escalonados de 60–240ms para blocos sucessivos).

---

## 5. Tela de login (especificação)

Split-screen `lg:grid-cols-[1.05fr_0.95fr]`, porta direta de `AdvocacIA/frontend/src/features/auth/LoginPage.tsx` com estes textos:

**Coluna esquerda (tese editorial, `bg-ink`):**
- Linha vertical dupla vermelho-carimbo à esquerda (`left-[4.25rem] w-px bg-carimbo/55` + `left-[4.5rem] bg-carimbo/15`).
- Marca no topo: quadrado `bg-carimbo` com ícone `Scale`, texto `font-mono text-xs tracking-[0.3em] uppercase`: `Advoca<span class="text-carimbo">IA</span> · CRM`.
- Numeração fantasma no fundo (canto inferior direito, `text-parchment/[0.03] font-mono text-[7rem]`): usar `LEAD-2026` / `#004821` (referência a código de lead, em vez do número de processo do GED).
- Kicker: `font-mono text-xs tracking-[0.35em] text-selo uppercase` → **"Pipeline sob controle"**.
- Headline `font-display text-5xl xl:text-6xl font-semibold`:
  `Do primeiro contato` / `ao <em class="text-carimbo">contrato assinado.</em>`
- Parágrafo (`text-parchment-dim`): "Todo lead atendido no prazo, toda proposta acompanhada. O funil comercial do escritório inteiro — leads, negociações e conversões — em um só painel."
- Card informativo (borda `line`, fundo `ink-2/30`): título mono uppercase **"LGPD & Uso Ético de IA"**, texto: "Este sistema opera em conformidade com a LGPD (Lei 13.709/2018). O atendimento por IA registra as conversas para fins comerciais, não fornece aconselhamento jurídico e transfere o contato a um advogado sempre que necessário."
- Rodapé: selo circular (`Seal` — círculo duplo `border-selo` com `Scale` e "MMXXVI") + `Gestão comercial · Vendas & Leads` em `font-mono text-[10px] uppercase`.

**Coluna direita (formulário, `bg-ink-2/40`):**
- Título `font-display text-3xl`: **"Entrar"**; subtítulo: "Acesse o painel comercial do escritório."
- Campos **Usuário** e **Senha** (a auth atual usa `username`, não email — manter), com toggle mostrar/ocultar senha (ícones `Eye`/`EyeOff`).
- Botão primário carimbo com `ArrowRight` e microtransição (`group-hover:translate-x-0.5`).
- Manter a lógica atual de redirect: `must_change_password` → `/change-password`; role `admin` → `/admin`; senão → `/secretary`.
- Sem bloco de usuários demo (diferente do GED — aqui é produção).
- Rodapé do formulário: card `border-line bg-ink/20` com nota LGPD curta em `font-mono text-[9px]`.

Estados: erro no padrão §4; loading "Entrando…" com botão `disabled:opacity-60`.

---

## 6. Tabela de conversão de classes (tema claro → Cartório Noturno)

Para a varredura das telas existentes (Fase 1.6 do [[10-transformation-plan]]):

| Classe atual (tema claro) | Substituir por |
|---|---|
| `bg-white`, `bg-gray-50`, `bg-gray-100` | `bg-ink-2` (cards) / `bg-ink` (fundos) |
| `text-gray-900`, `text-black` | `text-parchment` |
| `text-gray-500`, `text-gray-600`, `text-gray-700` | `text-parchment-dim` |
| `text-gray-400` | `text-parchment-faint` |
| `border`, `border-gray-200/300` | `border border-line` |
| `rounded-xl`, `rounded-lg`, `rounded-md` | `rounded-sm` |
| `shadow-sm`, `shadow`, `shadow-xl` | remover (borda `line` já delimita) |
| `bg-blue-600`, `bg-primary-600` | `bg-carimbo` |
| `hover:bg-blue-700` | `hover:bg-carimbo-bright` |
| `text-blue-600`, `text-primary-*` | `text-carimbo` (ação) ou `text-selo` (destaque) |
| `focus:ring-blue-500` | `focus:border-carimbo focus:ring-1 focus:ring-carimbo` |
| `bg-green-*` / `text-green-*` | `bg-jade/15 text-jade` |
| `bg-red-*` / `text-red-600` | `bg-carimbo/10 text-carimbo-bright` |
| `bg-yellow-*` / `text-yellow-*` | `bg-selo/15 text-selo` |
| `bg-sidebar`, `bg-sidebar-hover` | `bg-ink` + itens `bg-ink-3` (ativo) |
| `font-bold` em títulos de página | `font-display font-semibold` |

Cores de status do pipeline (kanban):

| Estágio | Cor |
|---|---|
| Novo | `info` |
| Em Contato | `selo` |
| Qualificado | `parchment-dim` |
| Proposta Enviada | `selo` |
| Negociando | `carimbo` (borda/acento, não fundo) |
| Cliente Fechado | `jade` |
| Perdido | `parchment-faint` |

---

## 7. App shell (sidebar + header)

Porta de `AdvocacIA/frontend/src/components/layout/AppShell.tsx` para os layouts Next:

- Grid `grid-cols-[15rem_1fr] min-h-screen bg-ink`; sidebar com `border-r border-line`.
- Branding no topo da sidebar: quadrado carimbo com `Scale` + `AdvocaIA · CRM` (mono, uppercase, `tracking-[0.2em]`); abaixo, versão em `text-parchment-faint`.
- Item de navegação: `rounded-sm px-3 py-2.5 text-sm`; inativo `text-parchment-dim hover:bg-ink-2 hover:text-parchment`; ativo `bg-ink-3 text-parchment` + barra `absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-carimbo`.
- Headings de seção da nav (Automações, Relatórios, Cadastros, Sistema): `font-mono text-[11px] uppercase tracking-widest text-parchment-faint`.
- Rodapé da sidebar: avatar de iniciais + nome + role em mono uppercase; botão "Sair" com `hover:text-carimbo`.
- Conteúdo principal: `bg-ink-2/30`; header sticky `border-b border-line bg-ink/80 backdrop-blur`.

Menu do admin (labels finais): Painel, Agenda do Escritório, Leads · **Automações:** Caixa Compartilhada, Chatbot / IA, IA Comercial, Follow-ups · **Relatórios:** Funil de Vendas · **Cadastros:** Clientes, Advogados, Áreas de Atuação, Usuários · **Sistema:** WhatsApp, Configurações.

Ícones: trocar `Stethoscope` → `Scale` (advogados), `Activity` → `Landmark` ou `BookOpenText` (áreas de atuação), `UserCircle` → `Users` (clientes). Demais mantêm.
