import { redirect } from 'next/navigation'

/**
 * The bare domain used to render the untouched Next.js starter template.
 * Middleware sends signed-out visitors to /login, but a signed-in one landing
 * on "/" fell through to that page instead of the app.
 */
export default function Home() {
  redirect('/dashboard')
}
