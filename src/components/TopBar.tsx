import { Link, useRouterState } from "@tanstack/react-router";
import VaultControl from "./vault/VaultControl";

// 52px tab nav per mock README. Brand mark + wordmark left, tabs center,
// vault control right. There is no "profile" — local-first; device is identity.

const TABS = [
  { to: "/", label: "Balance" },
  { to: "/ledger", label: "Ledger" },
  { to: "/entries", label: "Entries" },
  // { to: '/scenarios', label: 'Scenarios' }, TODO: scenarios are a stretch goal, and not in the initial MVP, so hiding for now
] as const;

export default function TopBar() {
  const isOnboarding = useRouterState({ select: s => s.location.pathname === '/onboarding' })

  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-20 rounded-field bg-ink px-3 py-1.5 text-[13px] text-card transition-transform focus-visible:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-10 h-13 border-b border-line bg-card">
        <nav className="mx-auto flex h-full max-w-270 items-center gap-6 px-6">
          <Link
            to="/"
            className="flex items-center gap-2 no-underline text-ink"
          >
            <span
              aria-hidden
              className="inline-block h-4.5 w-4.5 rounded-[5px] bg-accent"
            />
            <span className="mono text-[12px] uppercase tracking-[0.16em]">
              cashflow
            </span>
            <span className="rounded-pill border border-accent bg-accent-soft px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-accent-ink">
              beta
            </span>
          </Link>

          {!isOnboarding && <ul className="flex items-center gap-5 text-[13px]">
            {TABS.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact: true }}
                  className="border-b-2 border-transparent pb-px text-ink-2 no-underline transition-colors hover:text-ink aria-[current=page]:border-accent aria-[current=page]:font-medium aria-[current=page]:text-ink"
                  activeProps={{ "aria-current": "page" as const }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>}

          <div className="ml-auto">
            <VaultControl />
          </div>
        </nav>
      </header>
    </>
  );
}
