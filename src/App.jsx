import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import './App.css'
import Landing from './components/Landing'
import Login from './components/Login'
import Signup from './components/Signup'
import AppShell from './components/AppShell'
import AdminDashboard from './components/AdminDashboard'
import Privacy from './components/Privacy'

function App() {
  const [page, setPage] = useState('pgLand')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'ok') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  useEffect(() => {
    // Basic routing for Meta verification
    if (window.location.pathname === '/privacy') {
      setPage('pgPrivacy')
    }

    const initAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) return
        if (session?.user) {
          const { data: prof, error: profError } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (profError) {
            console.error('Profile fetch error:', profError)
            setUser(session.user)
            setProfile(null)
          } else {
            setUser(session.user)
            setProfile(prof)
          }
          setPage('pgApp')
        }
      } catch (err) {
        console.error('Init auth error:', err)
      }
    }
    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setPage('pgLand')
        return
      }
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session?.user) {
          const { data: prof, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
          if (error) return
          setUser(session.user)
          setProfile(prof)
          setPage('pgApp')
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogin = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { toast(error.message, 'err'); return }
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
    setUser(data.user)
    setProfile(prof)
    toast('Welcome back!')
    setPage('pgApp')
  }

  const handleSignup = async (bizName, email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { toast(error.message, 'err'); return }
    if (data.user) {
      const { error: updateErr } = await supabase.from('profiles').update({ business_name: bizName }).eq('id', data.user.id)
      if (updateErr) toast(updateErr.message, 'err')
      setUser(data.user)
      toast('Account created! Welcome to BotSeller.')
      setPage('pgApp')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setPage('pgLand')
    toast('Signed out', 'info')
  }

  const handleUpdateProfile = async (updatedProfile) => {
    const { error } = await supabase.from('profiles').update(updatedProfile).eq('id', user.id)
    if (error) { toast(error.message, 'err'); return }
    setProfile(updatedProfile)
    toast('Settings saved!')
  }

  const pages = {
    pgLand: <Landing onNavigate={setPage} />,
    pgLogin: <Login onLogin={handleLogin} onNavigate={setPage} />,
    pgSignup: <Signup onSignup={handleSignup} onNavigate={setPage} />,
    pgApp: user && profile ? (
      <AppShell user={user} profile={profile} onUpdateProfile={handleUpdateProfile} onLogout={handleLogout} toast={toast} />
    ) : <Landing onNavigate={setPage} />,
    pgPrivacy: <Privacy />
  }

  return (
    <>
      <div className="mesh-bg" />
      <div className="grid-bg" />

      <div className="toast-c">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i className={`fa-solid ${t.type === 'ok' ? 'fa-circle-check' : t.type === 'err' ? 'fa-circle-xmark' : 'fa-circle-info'}`} /> {t.msg}
          </div>
        ))}
      </div>

      {pages[page]}
    </>
  )
}

export default App
