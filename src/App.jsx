import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import './App.css'
import Landing from './components/Landing'
import Login from './components/Login'
import Signup from './components/Signup'
import AppShell from './components/AppShell'
import AdminDashboard from './components/AdminDashboard'
import Privacy from './components/Privacy'
import Terms from './components/Terms'
import PublicChat from './components/PublicChat'

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
    // New vNext Routing
    const path = window.location.pathname
    if (path.startsWith('/chat/')) {
      const slug = path.split('/chat/')[1]
      if (slug) {
        setPage('pgPublicChat')
        return
      }
    }

    if (path === '/privacy') setPage('pgPrivacy')
    if (path === '/terms') setPage('pgTerms')

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

  const handleSignup = async (bizName, email, password, industry) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) { toast(error.message, 'err'); return }
    if (data.user) {
      // 1. Update Profile with Business Name, Slug, and Industry
      const slug = bizName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000)
      const { error: updateErr } = await supabase.from('profiles').update({ 
        business_name: bizName,
        slug: slug,
        industry: industry
      }).eq('id', data.user.id)
      
      if (updateErr) console.error('Profile update error:', updateErr)

      // 2. Set Default Bot Instructions based on Industry
      const prompts = {
        food: "You are a professional waiter and sales assistant for a food business. Use food emojis, be very polite, and focus on helping customers place orders for meals.",
        fashion: "You are a stylish fashion consultant. Be trendy, helpful, and suggest the best outfits from our catalog.",
        tech: "You are a tech expert. Be precise with specifications, emphasize speed and quality, and help customers find the best gadgets.",
        beauty: "You are a beauty and skincare expert. Be welcoming, use sparkle emojis, and provide personalized product recommendations.",
        service: "You are a professional service assistant. Be formal, efficient, and help customers book appointments or learn about our services.",
        retail: "You are a helpful retail sales assistant. Focus on product features and ensuring a smooth shopping experience."
      }

      await supabase.from('bot_settings').upsert({
        user_id: data.user.id,
        custom_instructions: prompts[industry] || prompts.retail,
        bot_name: bizName + " AI"
      })

      setUser(data.user)
      // Fetch fresh profile
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single()
      setProfile(prof)
      
      toast('Account created! Your AI assistant is ready.')
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
    pgPrivacy: <Privacy />,
    pgTerms: <Terms />,
    pgPublicChat: <PublicChat />
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
