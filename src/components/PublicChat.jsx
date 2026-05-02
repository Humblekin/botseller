import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function PublicChat() {
  const [biz, setBiz] = useState(null)
  const [settings, setSettings] = useState(null)
  const [products, setProducts] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  
  const slug = window.location.pathname.split('/chat/')[1]
  const sessionId = useRef(localStorage.getItem('bs_session_id') || crypto.randomUUID())

  useEffect(() => {
    localStorage.setItem('bs_session_id', sessionId.current)
    fetchData()
    
    const channel = supabase.channel('public_chat_vnext_stable')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `conversation_id=eq.${sessionId.current}`
      }, payload => {
        setMessages(prev => {
          // Check for existing ID OR matching tempId in metadata to prevent duplicates
          const newMeta = payload.new.metadata ? (typeof payload.new.metadata === 'string' ? JSON.parse(payload.new.metadata) : payload.new.metadata) : {}
          const isDup = prev.some(m => 
            m.id === payload.new.id || 
            (m.tempId && newMeta.tempId === m.tempId)
          )
          if (isDup) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [slug])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function fetchData() {
    if (!slug) { setLoading(false); return }
    try {
      const { data: p } = await supabase.from('profiles').select('*').eq('slug', slug).maybeSingle()
      if (!p) { setLoading(false); return }
      setBiz(p)

      const [prods, msgs, sets] = await Promise.all([
        supabase.from('products').select('*').eq('user_id', p.id),
        supabase.from('messages').select('*').eq('conversation_id', sessionId.current).order('created_at', { ascending: true }),
        supabase.from('bot_settings').select('*').eq('user_id', p.id).maybeSingle()
      ])

      setProducts(prods.data || [])
      setMessages(msgs.data || [])
      setSettings(sets.data)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function callGeniusAI(userText) {
    // Priority: 1. User's key in settings, 2. Master key in .env
    const apiKey = settings?.groq_api_key || import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey || apiKey.includes('YOUR_')) {
      throw new Error("Missing Groq API Key. Please add VITE_GROQ_API_KEY to your .env file.")
    }

    const systemPrompt = settings?.custom_instructions || `You are a professional AI assistant for ${biz.business_name}.`
    const productList = products.map(p => `- ${p.name}: GH₵ ${p.price} (${p.description || ''})`).join('\n')

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: `${systemPrompt}\n\nOur Products:\n${productList}\n\nInstructions:\n- Be conversational and helpful.\n- Use emojis.\n- If they want to order, confirm the items and price.\n- Industry: ${biz.industry}.` },
          { role: 'user', content: userText }
        ]
      })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.choices[0].message.content
  }

  async function handleSend() {
    if (!input.trim() || !biz || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)

    const tempId = Date.now()
    setMessages(prev => [...prev, { id: tempId, tempId, role: 'user', content: text, created_at: new Date().toISOString() }])

    const { data: msg } = await supabase.from('messages').insert({
      business_id: biz.id,
      customer_number: 'web_visitor',
      conversation_id: sessionId.current,
      role: 'user',
      content: text,
      metadata: { source: 'web_chat_vnext', tempId: tempId }
    }).select().single()

    setMessages(prev => prev.map(m => m.id === tempId ? msg : m))

    try {
      // 1. Try Cloud AI Brain
      const { error: funcError } = await supabase.functions.invoke('ai-chat', { body: { messageId: msg.id } })
      if (funcError) throw funcError
    } catch (err) {
      console.warn('Cloud AI disconnected, trying Direct Genius Brain...', err)
      try {
        // 2. Try Direct Genius Brain (Direct to Groq)
        const replyText = await callGeniusAI(text)
        await supabase.from('messages').insert({
          business_id: biz.id,
          customer_number: 'web_visitor',
          conversation_id: sessionId.current,
          role: 'assistant',
          content: replyText,
          metadata: { source: 'genius_direct' }
        })
      } catch (genErr) {
        console.error('Total AI Failure:', genErr)
        const errorMessage = `Brain Connection Issue: ${genErr.message}`
        await supabase.from('messages').insert({
          business_id: biz.id,
          customer_number: 'web_visitor',
          conversation_id: sessionId.current,
          role: 'assistant',
          content: errorMessage,
          metadata: { source: 'error_report', error: genErr.message }
        })
      }
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="chat-loading"><div className="mesh-bg" /><div className="loader" /></div>
  if (!biz) return <div className="chat-error"><div className="mesh-bg" /><div className="card">Store Not Found</div></div>

  return (
    <div className="pc-container">
      <div className="mesh-bg" style={{ opacity: 0.4 }} />
      <div className="pc-main-wrapper">
        <header className="pc-header">
          <div className="pc-biz-info">
            <div className="pc-avatar">{biz.business_name.charAt(0)}</div>
            <div>
              <div className="pc-name">{biz.business_name}</div>
              <div className="pc-status"><span className="sd on" /> <span>AI Assistant Online</span></div>
            </div>
          </div>
        </header>

        <main className="pc-chat" ref={scrollRef}>
          <div className="pc-welcome">
            <div className="si" style={{ background: 'var(--acg)', margin: '0 auto 16px' }}><i className="fa-solid fa-robot" style={{ color: 'var(--ac)' }} /></div>
            <h2>Welcome to {biz.business_name}!</h2>
            <p>I am your AI shopping assistant. How can I help you today?</p>
          </div>

          {messages.map((m, i) => (
            <div key={m.id || i} className={`m-wrap ${m.role === 'user' ? 'user-side' : 'bot-side'}`}>
              <div className={m.role === 'user' ? 'u-bubble' : 'b-bubble'}>{m.content}</div>
              <span className="m-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {m.role === 'user' ? 'You' : 'AI Assistant'}</span>
            </div>
          ))}
          {sending && (
            <div className="m-wrap bot-side">
              <div className="b-bubble" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span className="dot" style={{ animation: 'blink 1.4s infinite both' }}>.</span>
                <span className="dot" style={{ animation: 'blink 1.4s infinite both .2s' }}>.</span>
                <span className="dot" style={{ animation: 'blink 1.4s infinite both .4s' }}>.</span>
              </div>
            </div>
          )}
        </main>

        <footer className="pc-footer">
          <div className="pc-input-wrap">
            <input type="text" placeholder="Type your message..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
            <button onClick={handleSend} disabled={sending || !input.trim()}><i className="fa-solid fa-paper-plane" /></button>
          </div>
          <p className="pc-powered">Powered by <b>BotSeller vNext</b></p>
        </footer>
      </div>

      <style>{`
        .pc-container { height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font-family: 'DM Sans', sans-serif; position: fixed; inset: 0; z-index: 9999; align-items: center; }
        .pc-main-wrapper { width: 100%; max-width: 600px; height: 100%; display: flex; flex-direction: column; background: var(--bg); border-left: 1px solid var(--brd); border-right: 1px solid var(--brd); position: relative; box-shadow: 0 0 100px rgba(0,0,0,0.5); }
        .pc-header { padding: 14px 20px; background: rgba(12, 22, 16, 0.98); backdrop-filter: blur(12px); border-bottom: 1px solid var(--brd); display: flex; align-items: center; justify-content: space-between; z-index: 10; }
        .pc-biz-info { display: flex; align-items: center; gap: 12px; }
        .pc-avatar { width: 38px; height: 38px; background: var(--ac); color: #000; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; font-family: 'Space Grotesk'; }
        .pc-name { font-weight: 700; font-size: 15px; font-family: 'Space Grotesk'; color: var(--fg); }
        .pc-status { font-size: 11px; color: var(--fg2); display: flex; align-items: center; gap: 6px; margin-top: 1px; }
        .pc-chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 24px; background: #0b141a; }
        .pc-welcome { text-align: center; padding: 40px 20px; color: var(--fg2); max-width: 320px; margin: 0 auto; }
        .pc-welcome h2 { color: var(--fg); margin-bottom: 10px; font-size: 22px; font-family: 'Space Grotesk'; }
        .m-wrap { display: flex; flex-direction: column; max-width: 85%; animation: pgIn 0.3s ease forwards; }
        .m-wrap.user-side { align-self: flex-end; align-items: flex-end; }
        .u-bubble { background: linear-gradient(135deg, var(--ac3), var(--ac)) !important; color: #000 !important; font-weight: 500; border-radius: 18px 18px 4px 18px; padding: 12px 16px; font-size: 15px; line-height: 1.5; box-shadow: 0 4px 15px rgba(37, 211, 102, 0.2); }
        .m-wrap.bot-side { align-self: flex-start; align-items: flex-start; }
        .b-bubble { background: #262d31 !important; color: var(--fg) !important; border: 1px solid rgba(255,255,255,0.05); border-radius: 18px 18px 18px 4px; padding: 12px 16px; font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
        .m-time { font-size: 10px; color: var(--fg3); margin-top: 6px; padding: 0 4px; }
        .pc-footer { padding: 12px 16px 20px; background: rgba(12, 22, 16, 0.98); backdrop-filter: blur(12px); border-top: 1px solid var(--brd); z-index: 10; }
        .pc-input-wrap { background: var(--bg3); border: 1px solid var(--brd); border-radius: 14px; display: flex; align-items: center; padding: 5px 5px 5px 16px; gap: 8px; }
        .pc-input-wrap input { flex: 1; background: transparent; border: none; color: #fff; outline: none; font-size: 15px; padding: 10px 0; }
        .pc-input-wrap button { width: 42px; height: 42px; background: var(--ac); color: #000; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .pc-powered { text-align: center; font-size: 10px; color: var(--fg3); margin-top: 12px; letter-spacing: 0.5px; text-transform: uppercase; }
        .loader { width: 32px; height: 32px; border: 3px solid var(--brd); border-top-color: var(--ac); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; } }
        @media (max-width: 600px) { .pc-main-wrapper { border: none; max-width: 100%; } }
      `}</style>
    </div>
  )
}
