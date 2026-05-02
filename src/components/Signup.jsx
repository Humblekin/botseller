import { useState } from 'react'

const INDUSTRIES = [
  { id: 'food', name: 'Food & Restaurant', icon: 'fa-utensils' },
  { id: 'fashion', name: 'Fashion & Clothing', icon: 'fa-shirt' },
  { id: 'tech', name: 'Electronics & Tech', icon: 'fa-laptop' },
  { id: 'beauty', name: 'Beauty & Cosmetics', icon: 'fa-sparkles' },
  { id: 'retail', name: 'General Retail', icon: 'fa-store' },
  { id: 'service', name: 'Professional Services', icon: 'fa-briefcase' }
]

export default function Signup({ onSignup, onNavigate }) {
  const [bizName, setBizName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [industry, setIndustry] = useState('retail')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    await onSignup(bizName, email, password, industry)
    setLoading(false)
  }

  return (
    <div className="page active">
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 460 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, background: 'var(--acg)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="fa-solid fa-robot" style={{ color: 'var(--ac)', fontSize: 28 }} />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'Space Grotesk' }}>Join BotSeller vNext</h1>
            <p style={{ color: 'var(--fg2)', fontSize: 15 }}>Launch your autonomous AI Storefront in seconds.</p>
          </div>
          
          <form className="card" style={{ padding: 32 }} onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="fl">Business Name</label>
              <input type="text" className="fi" value={bizName} onChange={e => setBizName(e.target.value)} placeholder="e.g. Tasty Bites" required />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="fl">What kind of business is this?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {INDUSTRIES.map(ind => (
                  <div 
                    key={ind.id}
                    onClick={() => setIndustry(ind.id)}
                    style={{ 
                      padding: '12px', 
                      borderRadius: 10, 
                      border: `1px solid ${industry === ind.id ? 'var(--ac)' : 'var(--brd)'}`,
                      background: industry === ind.id ? 'var(--acg)' : 'var(--bg2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className={`fa-solid ${ind.icon}`} style={{ color: industry === ind.id ? 'var(--ac)' : 'var(--fg3)', width: 16 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: industry === ind.id ? 'var(--fg)' : 'var(--fg2)' }}>{ind.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="fl">Email Address</label>
              <input type="email" className="fi" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div style={{ marginBottom: 28 }}>
              <label className="fl">Password</label>
              <input type="password" className="fi" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
            </div>

            <button type="submit" className="btn-p" style={{ width: '100%', padding: 14, marginBottom: 16 }} disabled={loading}>
              {loading ? 'Setting up your AI Storefront...' : 'Start Selling with AI'}
            </button>
            
            <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--fg2)' }}>
              Already using BotSeller?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('pgLogin'); }} style={{ color: 'var(--ac)', textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
            </p>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('pgLand'); }} style={{ color: 'var(--fg3)', fontSize: 13, textDecoration: 'none' }}>
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 4 }} /> Back to home
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
