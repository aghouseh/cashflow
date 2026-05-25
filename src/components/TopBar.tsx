import { Link } from '@tanstack/react-router'

// 52px tab nav per mock README. Brand mark + wordmark left, tabs center, account chip right.
// Active tab styling driven by TanStack Router's activeProps.

const TABS = [
  { to: '/', label: 'Balance' },
  { to: '/ledger', label: 'Ledger' },
  { to: '/entries', label: 'Entries' },
  { to: '/scenarios', label: 'Scenarios' },
] as const

export default function TopBar() {
  return (
    <header className="sticky top-0 z-10 h-13 border-b border-line bg-card">
      <nav className="mx-auto flex h-full max-w-270 items-center gap-6 px-6">
        <Link to="/" className="flex items-center gap-2 no-underline text-ink">
          <span aria-hidden className="inline-block h-4.5 w-4.5 rounded-[5px] bg-ink" />
          <span className="mono text-[12px] uppercase tracking-[0.16em]">cashflow</span>
        </Link>

        <ul className="flex items-center gap-5 text-[13px]">
          {TABS.map(({ to, label }) => (
            <li key={to}>
              <Link
                to={to}
                className="text-ink-2 no-underline transition-colors hover:text-ink"
                activeProps={{ className: 'text-ink no-underline' }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded-chip border border-line-2 px-3 py-1 text-[12px] text-ink-2 transition-colors hover:text-ink"
          >
            Personal
          </button>
          <div aria-hidden className="h-7 w-7 rounded-full bg-ink-4" />
        </div>
      </nav>
    </header>
  )
}
