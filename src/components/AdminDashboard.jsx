import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminDashboard({ user, profile, onLogout, toast, standalone = false }) {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [payments, setPayments] = useState([])
  const [allSubs, setAllSubs] = useState([])
  const [allMsgs, setAllMsgs] = useState([])
  const [allProds, setAllProds] = useState([])
  const [manageUserId, setManageUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(null)
  const [debugInfo, setDebugInfo] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setDebugInfo({
        hasMeta: !!session?.user?.app_metadata?.is_admin,
        profileAdmin: profile?.is_admin
      })

      const [usersRes, paymentsRes, subsRes, msgsRes, prodsRes, msgCountRes] = await Promise.all([
        supabase.from('profiles').select('id, email, business_name, is_admin, created_at').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('messages').select('business_id, role'),
        supabase.from('products').select('user_id'),
        supabase.from('messages').select('id', { count: 'exact', head: true })
      ])

      if (usersRes.error) throw new Error(`Profiles: ${usersRes.error.message}`)
      
      setUsers(usersRes.data || [])
      setPayments(paymentsRes.data || [])
      setAllSubs(subsRes.data || [])
      setAllMsgs(msgsRes.data || [])
      setAllProds(prodsRes.data || [])

      setStats({
        totalUsers: usersRes.data?.length || 0,
        activeSubs: subsRes.data?.filter(s => s.status === 'active').length || 0,
        totalMsgs: msgCountRes.count || 0,
        revenue: paymentsRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
      })
    } catch (err) {
      console.error('Admin fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { fetchData() }, [fetchData])

  const getMsgCount = (userId) => {
    return allMsgs.filter(m => m.business_id === userId && m.role === 'assistant').length
  }

  const getProdCount = (userId) => {
    return allProds.filter(p => p.user_id === userId).length
  }

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return u.business_name?.toLowerCase().includes(term) ||
      u.email?.toLowerCase().includes(term)
  })

  const handleAdminAction = async (userId, action, value) => {
    try {
      if (action === 'plan') {
        await supabase.from('subscriptions').update({ plan: value }).eq('user_id', userId)
        toast(`User plan updated to ${value}`, 'info')
      } else if (action === 'extend') {
        const currentSub = await supabase.from('subscriptions').select('expiry_date').eq('user_id', userId).single()
        const newDate = new Date(currentSub.data?.expiry_date || Date.now())
        newDate.setDate(newDate.getDate() + value)
        await supabase.from('subscriptions').update({ 
          expiry_date: newDate.toISOString(),
          status: 'active' // Ensure they are reactivated when trial is extended
        }).eq('user_id', userId)
        toast(`Trial extended and reactivated for ${value} days`, 'info')
      } else if (action === 'ban') {
        await supabase.from('subscriptions').update({ status: value }).eq('user_id', userId)
        toast(`User ${value === 'suspended' ? 'suspended' : 'activated'}`, 'info')
      } else if (action === 'delete') {
        if (window.confirm('PERMANENTLY delete user?')) {
          await supabase.from('profiles').delete().eq('id', userId)
          toast('User deleted', 'info')
        }
      }
      setManageUserId(null)
      fetchData()
    } catch (err) {
      toast('Action failed: ' + err.message, 'err')
    }
  }

  if (loading && !error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
        <div className="loader" style={{ marginBottom: 20 }} />
        <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Initializing Admin Console...</p>
      </div>
    )
  }

  return (
    <div className="admin-container" style={{ animation: 'fadeIn 0.4s ease' }}>
      {/* Header Section */}
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 8 }}>System Admin</h1>
          <p style={{ color: 'var(--fg2)', fontSize: 15 }}>Manage platform operations and user health</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-g" onClick={fetchData}><i className="fa-solid fa-rotate" /> Refresh</button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'var(--red)', background: 'rgba(239,68,68,0.05)', borderRadius: 16 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
              <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 20 }} />
            </div>
            <div>
              <h3 style={{ color: 'var(--red)', fontSize: 16, marginBottom: 4 }}>Access Restricted</h3>
              <p style={{ fontSize: 14, color: 'var(--fg2)' }}>{error}</p>
              {!debugInfo?.hasMeta && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 8, fontSize: 12, borderLeft: '3px solid var(--ac)' }}>
                  <strong>Tip:</strong> Log out and log back in to refresh your admin permissions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 32 }}>
        <StatCard icon="fa-users" color="#3b82f6" value={stats?.totalUsers || 0} label="Total Users" />
        <StatCard icon="fa-gem" color="var(--ac)" value={stats?.activeSubs || 0} label="Pro Members" />
        <StatCard icon="fa-bolt" color="#a855f7" value={stats?.totalMsgs || 0} label="Messages Sent" />
        <StatCard icon="fa-wallet" color="#10b981" value={`GH₵ ${(stats?.revenue || 0).toLocaleString()}`} label="Gross Revenue" />
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        
        {/* User Management Table */}
        <div className="card" style={{ borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>User Management</h3>
            <div style={{ position: 'relative', width: 300 }}>
              <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg3)', fontSize: 14 }} />
              <input 
                type="text" 
                className="fi" 
                placeholder="Search name or email..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 36, fontSize: 14, height: 40 }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
              <thead>
                <tr style={{ color: 'var(--fg3)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ textAlign: 'left', padding: '0 12px' }}>Business</th>
                  <th style={{ textAlign: 'left', padding: '0 12px' }}>Subscription</th>
                  <th style={{ textAlign: 'left', padding: '0 12px' }}>Activity</th>
                  <th style={{ textAlign: 'right', padding: '0 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => {
                  const sub = allSubs.find(s => s.user_id === u.id)
                  const msgCount = getMsgCount(u.id)
                  const isActive = sub?.status === 'active'
                  return (
                    <tr key={u.id} className="user-row" style={{ background: 'var(--bg2)', borderRadius: 12 }}>
                      <td style={{ padding: '16px 12px', borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--acg)', color: 'var(--ac)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                            {u.business_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{u.business_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--fg3)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`badge ${sub?.plan === 'starter' ? 'b-off' : 'b-on'}`} style={{ textTransform: 'capitalize' }}>{sub?.plan || 'Free'}</span>
                          <span style={{ fontSize: 11, color: 'var(--fg3)' }}>Exp: {sub?.expiry_date ? fmtDate(sub.expiry_date) : 'N/A'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontSize: 12 }}>
                          <span style={{ fontWeight: 600, color: 'var(--ac)' }}>{msgCount}</span> <span style={{ color: 'var(--fg3)' }}>msgs</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', borderTopRightRadius: 12, borderBottomRightRadius: 12 }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn-g" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setManageUserId(u.id)}>Manage</button>
                          <button className="btn-s" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => handleAdminAction(u.id, 'extend', 7)}>+7d</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--fg3)' }}>
                <i className="fa-solid fa-ghost" style={{ fontSize: 32, marginBottom: 16, display: 'block', opacity: 0.5 }} />
                <p>No businesses found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel: Recent Transactions */}
        <div className="card" style={{ borderRadius: 20, padding: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Revenue Feed</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {payments.slice(0, 10).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--brd)', paddingBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>GH₵ {Number(p.amount).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 2 }}>{fmtDate(p.created_at)}</div>
                </div>
                <span className={`badge ${p.status === 'success' ? 'b-on' : 'b-wrn'}`} style={{ fontSize: 10 }}>{p.status}</span>
              </div>
            ))}
            {payments.length === 0 && <p style={{ textAlign: 'center', color: 'var(--fg3)', fontSize: 13, padding: '20px 0' }}>No payments yet.</p>}
          </div>
        </div>

      </div>

      {/* Management Modal */}
      {manageUserId && (
        <ManageModal 
          userId={manageUserId} 
          onClose={() => setManageUserId(null)} 
          onAction={handleAdminAction} 
          profile={profile}
          allSubs={allSubs}
        />
      )}
    </div>
  )
}

function ManageModal({ userId, onClose, onAction, profile, allSubs }) {
  const [sub, setSub] = useState(null)
  const [newPlan, setNewPlan] = useState('')
  const [extendDays, setExtendDays] = useState(7)

  useEffect(() => {
    const s = allSubs.find(s => s.user_id === userId)
    if (s) {
      setSub(s)
      setNewPlan(s.plan)
    }
  }, [userId, allSubs])

  if (!userId) return null

  return (
    <div className={`mo ${userId ? 'open' : ''}`} onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 0, borderRadius: 24, overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 16px', background: 'var(--acg)', borderBottom: '1px solid var(--ac3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>Manage Account</h2>
            <button className="btn-g" onClick={onClose} style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}><i className="fa-solid fa-xmark" /></button>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {sub ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg2)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 4 }}>Current Plan</div>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase' }}>{sub.plan}</div>
                </div>
                <div style={{ background: 'var(--bg2)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 4 }}>Account Status</div>
                  <div style={{ fontWeight: 700, color: sub.status === 'active' ? 'var(--ac)' : 'var(--red)' }}>{sub.status.toUpperCase()}</div>
                </div>
              </div>

              <div>
                <label className="fl" style={{ fontSize: 12, fontWeight: 600 }}>Update Subscription Plan</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <select className="fi" value={newPlan} onChange={e => setNewPlan(e.target.value)} style={{ flex: 1 }}>
                    <option value="starter">Starter Plan</option>
                    <option value="business">Business Plan</option>
                    <option value="enterprise">Enterprise Plan</option>
                  </select>
                  <button className="btn-p" onClick={() => onAction(userId, 'plan', newPlan)}>Update</button>
                </div>
              </div>

              <div>
                <label className="fl" style={{ fontSize: 12, fontWeight: 600 }}>Extend Expiry (Days)</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input type="number" className="fi" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} style={{ flex: 1 }} />
                  <button className="btn-s" onClick={() => onAction(userId, 'extend', extendDays)}>Add Time</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--brd)', paddingTop: 20 }}>
                {sub.status === 'active' ? (
                  <button className="btn-s" style={{ flex: 1, color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => onAction(userId, 'ban', 'suspended')}>Suspend Account</button>
                ) : (
                  <button className="btn-p" style={{ flex: 1 }} onClick={() => onAction(userId, 'ban', 'active')}>Activate Account</button>
                )}
                {userId !== profile?.id && (
                  <button className="btn-d" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', width: 50 }} onClick={() => onAction(userId, 'delete')} title="Delete User">
                    <i className="fa-solid fa-trash-can" />
                  </button>
                )}
              </div>
            </>
          ) : <div className="loader" style={{ margin: '40px auto' }} />}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, color, value, label }) {
  return (
    <div className="card" style={{ padding: 24, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className={`fa-solid ${icon}`} style={{ fontSize: 22 }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--fg2)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  )
}
