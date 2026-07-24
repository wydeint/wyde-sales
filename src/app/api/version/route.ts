import { NextResponse } from 'next/server'

// BUILD_TIME is baked in at build time — changes every Vercel deployment
const BUILD_TIME = process.env.VERCEL_DEPLOYMENT_ID || process.env.NEXT_PUBLIC_BUILD_TIME || 'dev'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET() {
  return NextResponse.json({ version: BUILD_TIME })
}
