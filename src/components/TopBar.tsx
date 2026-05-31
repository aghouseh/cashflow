import { Link } from "@tanstack/react-router";
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
          </Link>

          <ul className="flex items-center gap-5 text-[13px]">
            {TABS.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="text-ink-2 no-underline transition-colors hover:text-ink"
                  activeProps={{
                    className: "text-ink no-underline",
                    "aria-current": "page" as const,
                  }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="ml-auto">
            <VaultControl />
          </div>
        </nav>
      </header>
    </>
  );
}
