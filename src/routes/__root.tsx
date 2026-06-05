import { HeadContent, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useEffect, useState } from 'react'
import { PostHogProvider } from '@posthog/react'
import LockedScreen from '../components/vault/LockedScreen'
import TopBar from '../components/TopBar'
import { useVaultMode } from '../lib/vault/use-vault'
import { Sentry } from '../lib/analytics/index.js'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Cashflow' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const vaultMode = useVaultMode()
  // Track whether the gate is visible independently of vaultMode so the reveal
  // animation can finish before the component unmounts. Set back to true
  // immediately if the vault is locked again (manual lock / timeout).
  const [showLock, setShowLock] = useState(() => vaultMode === 'locked')
  useEffect(() => {
    if (vaultMode === 'locked') setShowLock(true)
  }, [vaultMode])

  const isOnboarding = useRouterState({ select: s => s.location.pathname === '/onboarding' })

  const appShell = (
    <>
      <TopBar />
      {isOnboarding ? (
        <main id="main-content">{children}</main>
      ) : (
        <main id="main-content" className="mx-auto max-w-270 px-6 py-6">
          {children}
        </main>
      )}
    </>
  )

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogProvider
          apiKey={import.meta.env.VITE_POSTHOG_PROJECT_TOKEN!}
          options={{
            api_host: '/ingest',
            ui_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.posthog.com',
            defaults: '2025-05-24',
            capture_exceptions: true,
            debug: import.meta.env.DEV,
          }}
        >
          <Sentry.ErrorBoundary fallback={<AppError />}>
            {showLock ? (
              <LockedScreen onUnlocked={() => setShowLock(false)}>
                {appShell}
              </LockedScreen>
            ) : (
              appShell
            )}
          </Sentry.ErrorBoundary>
        </PostHogProvider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function AppError() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', fontSize: '13px' }}>
      <p>Something went wrong. Reload to try again.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
        Reload
      </button>
    </div>
  )
}
