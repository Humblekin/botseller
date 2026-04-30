import { useState } from 'react'

export default function Login({ onLogin, onNavigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await onLogin(email, password)
    setLoading(false)
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
