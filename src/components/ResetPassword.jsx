import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword({ onNavigate }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'SIGNED_OUT') {
        setError('Invalid or expired reset link. Please request a new one.')
      }
    })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
    } else {
      setDone(true)
    }
    setLoading(false)
  }

  return (
    <div className="page active">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ width: 48, height: 48, background: 'var(--acg)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="fa-solid fa-lock" style={{ color: 'var(--ac)', fontSize: 24 }} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
              {done ? 'Password updated' : 'New password'}
            </h1>
            <p style={{ color: 'var(--fg2)', fontSize: 14 }}>
              {done ? 'Your password has been changed successfully' : 'Choose a strong password for your account'}
            </p>
          </div>

          {error && (
            <div style={{ background: 'var(--errg)', color: 'var(--err)', padding: '12px 16px', borderRadius: 10, marginBottom: 20, fontSize: 14, textAlign: 'center' }}>
              <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} /> {error}
            </div>
          )}

          {done ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <i className="fa-solid fa-circle-check" style={{ fontSize: 48, color: 'var(--ok)', marginBottom: 16 }} />
              <p style={{ marginBottom: 24, color: 'var(--fg2)' }}>You can now sign in with your new password.</p>
              <button className="btn-p" style={{ width: '100%' }} onClick={() => onNavigate('pgLogin')}>
                Sign In
              </button>
            </div>
          ) : (
            <form className="card" style={{ padding: 32 }} onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label className="fl">New password</label>
                <input type="password" className="fi" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label className="fl">Confirm password</label>
                <input type="password" className="fi" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" minLength={6} required />
              </div>
              <button type="submit" className="btn-p" style={{ width: '100%', marginBottom: 16 }} disabled={loading}>
                {loading ? 'Updating...' : 'Update password'}
              </button>
              <button type="button" className="btn-s" style={{ width: '100%' }} onClick={() => onNavigate('pgLogin')}>
                <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} /> Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
