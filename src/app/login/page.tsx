'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="w-full max-w-sm mx-4">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1d6fa5] mb-4">
            <span className="text-white text-2xl font-bold">W</span>
          </div>
          <h1 className="text-white text-2xl font-bold">WydEInt CRM</h1>
          <p className="text-[#8b949e] text-sm mt-1">Sales Management System</p>
        </div>

        {/* Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8">
          <h2 className="text-white text-lg font-semibold mb-1">เข้าสู่ระบบ</h2>
          <p className="text-[#8b949e] text-sm mb-6">
            ใช้ Google account ของบริษัทเข้าสู่ระบบ
          </p>

          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-3 px-4 rounded-xl transition-colors duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <p className="text-center text-[#8b949e] text-xs mt-6">
          เฉพาะผู้ใช้ที่ได้รับสิทธิ์เท่านั้น
        </p>
      </div>
    </div>
  )
}
