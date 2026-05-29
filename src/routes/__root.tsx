import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useEffect, useState } from 'react'
import LockedScreen from '../components/vault/LockedScreen'
import TopBar from '../components/TopBar'
import { useVaultMode } from '../lib/vault/use-vault'

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

  const appShell = (
    <>
      <TopBar />
      <main className="mx-auto max-w-270 px-6 py-6">
        {children}
      </main>
    </>
  )

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {showLock ? (
          <LockedScreen onUnlocked={() => setShowLock(false)}>
            {appShell}
          </LockedScreen>
        ) : (
          appShell
        )}
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
