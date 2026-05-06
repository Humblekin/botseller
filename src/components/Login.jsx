import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onLogin, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    await onLogin(email, password)
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (resetLoading) return
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin
    })
    if (error) {
      alert(error.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  if (showReset) {
    return (
      <div className="page active">
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ width: 48, height: 48, background: 'var(--acg)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <i className="fa-solid fa-key" style={{ color: 'var(--ac)', fontSize: 24 }} />
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Reset password</h1>
              <p style={{ color: 'var(--fg2)', fontSize: 14 }}>
                {resetSent ? 'Check your email for the reset link' : 'Enter your email to receive a reset link'}
              </p>
            </div>
            {resetSent ? (
              <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                <i className="fa-solid fa-envelope-circle-check" style={{ fontSize: 40, color: 'var(--ac)', marginBottom: 16 }} />
                <p style={{ marginBottom: 24, color: 'var(--fg2)' }}>We sent a password reset link to <strong>{resetEmail}</strong>. Click the link to create a new password.</p>
                <button className="btn-s" style={{ width: '100%', marginBottom: 12 }} onClick={() => { setResetSent(false); setResetEmail(''); }}>
                  <i className="fa-solid fa-rotate" style={{ marginRight: 6 }} /> Resend email
                </button>
                <button className="btn-s" style={{ width: '100%' }} onClick={() => setShowReset(false)}>
                  <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} /> Back to sign in
                </button>
              </div>
            ) : (
              <form className="card" style={{ padding: 32 }} onSubmit={handleReset}>
                <div style={{ marginBottom: 24 }}>
                  <label className="fl">Email</label>
                  <input type="email" className="fi" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <button type="submit" className="btn-p" style={{ width: '100%', marginBottom: 16 }} disabled={resetLoading}>
                  {resetLoading ? 'Sending...' : 'Send reset link'}
                </button>
                <button type="button" className="btn-s" style={{ width: '100%' }} onClick={() => setShowReset(false)}>
                  <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} /> Back to sign in
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page active">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ width: 48, height: 48, background: 'var(--ac)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="fa-brands fa-whatsapp" style={{ color: '#000', fontSize: 24 }} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Welcome back</h1>
            <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Sign in to your BotSeller dashboard</p>
          </div>
          <form className="card" style={{ padding: 32 }} onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="fl">Email</label>
              <input type="email" className="fi" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="fl">Password</label>
              <input type="password" className="fi" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
            </div>
            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setShowReset(true); }} style={{ color: 'var(--ac)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Forgot password?</a>
            </div>
            <button type="submit" className="btn-p" style={{ width: '100%', marginBottom: 16 }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--fg2)' }}>
              Don&apos;t have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('pgSignup'); }} style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 500 }}>Sign up</a>
            </p>
          </form>
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('pgLand'); }} style={{ color: 'var(--fg3)', fontSize: 13, textDecoration: 'none' }}>
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 4 }} /> Back to home
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
