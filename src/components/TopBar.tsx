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
        {/* Flex layout: brand left, tabs absolutely centered, right slot ml-auto.
            Using absolute-center for tabs keeps the right slot truly right-aligned
            regardless of whether the center nav is present or hidden. */}
        <nav className="relative mx-auto flex h-full max-w-270 items-center px-6">
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
            <span className="rounded-chip border border-accent bg-accent-soft px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-accent-ink">
              beta
            </span>
          </Link>

          {!isOnboarding && (
            <ul className="absolute inset-x-0 flex items-center justify-center gap-0.5">
              {TABS.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    activeOptions={{ exact: true }}
                    className="block rounded-[6px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3 no-underline transition-colors hover:text-ink aria-[current=page]:bg-card-2 aria-[current=page]:text-ink"
                    activeProps={{ "aria-current": "page" as const }}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="ml-auto">
            {isOnboarding ? (
              <span className="flex items-center gap-1.5 rounded-chip border border-line bg-card-2 px-2.5 py-1 font-mono text-[11px] tracking-[0.02em] text-ink-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" style={{ opacity: 0.75 }}>
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Local only
              </span>
            ) : (
              <VaultControl />
            )}
          </div>
        </nav>
      </header>
    </>
  );
}
