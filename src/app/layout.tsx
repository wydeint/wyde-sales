import type { Metadata } from 'next'
import { Roboto, Noto_Sans_Thai, Roboto_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import PwaUpdateBanner from '@/components/PwaUpdateBanner'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

/**
 * Two families, one stack — Roboto first, Noto Sans Thai second.
 *
 * Roboto carries no Thai glyphs, so every Thai character falls through to
 * Noto Sans Thai on its own. Latin and digits therefore render in Roboto and
 * Thai in Noto, without a single per-element font class anywhere in the app.
 *
 * The pair is deliberate: both come from the same design brief at Google, so
 * their x-heights line up and a mixed line like "ห้อง A419" sits level.
 *
 * This replaces Geist, which the app downloaded on every load and then never
 * used — `body` in globals.css overrode it with the OS stack, so Thai text was
 * rendering in whatever each machine happened to have (Leelawadee UI on
 * Windows, Thonburi on macOS, Noto on Android). Same page, three widths.
 */
const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
})
const notoThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  subsets: ['thai'],
  weight: ['400', '600', '700'],
  display: 'swap',
})
const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Super Sales — WydEInt',
  description: 'WydEInt Interior CRM — Sales Management',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Super Sales',
  },
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${roboto.variable} ${notoThai.variable} ${robotoMono.variable} h-full`}
    >
      <head>
        {/* Inline script runs BEFORE React hydrates — prevents dark/light flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('wyde-theme')||'light';document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}})()` }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#6366f1" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
        <PwaUpdateBanner />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
