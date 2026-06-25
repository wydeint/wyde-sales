'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg-gradient)', backgroundAttachment: 'fixed' }}
    >
      {/* Decorative blobs */}
      <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="fixed bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      <div className="fixed top-[40%] right-[10%] w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 70%)', filter: 'blur(30px)' }} />

      {/* Login card */}
      <div
        className="relative w-full max-w-sm rounded-3xl p-8"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid var(--glass-border)',
          boxShadow: '0 24px 60px rgba(99,102,241,0.12), 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 mb-4 flex items-center justify-center">
            <img src="/logo.svg" alt="WydE Int." className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-1)' }}>
            Wyde Sales
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            WydEInt Interior · ระบบจัดการงานขาย
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px" style={{ background: 'var(--divider)' }} />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>เข้าสู่ระบบด้วย</span>
          <div className="flex-1 h-px" style={{ background: 'var(--divider)' }} />
        </div>

        {/* Google button */}
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl font-semibold text-sm relative overflow-hidden group"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(241,245,255,0.9))',
            border: '1px solid rgba(209,213,254,0.6)',
            color: '#1e1b4b',
            boxShadow: '0 4px 16px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))' }} />
          <svg className="relative z-10 flex-shrink-0" width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span className="relative z-10">Sign in with Google</span>
        </button>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-3)' }}>
          เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น
        </p>
      </div>
    </div>
  )
}
