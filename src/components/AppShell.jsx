import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import PaystackPop from '@paystack/inline-js'
import AdminDashboard from './AdminDashboard'

const PLANS = {
  starter: { name: 'Free Trial', price: 0, msgs: 50, prods: 10, badge: 'b-wrn', btext: 'Trial' },
  business: { name: 'Business', price: 99, msgs: 2000, prods: Infinity, badge: 'b-on', btext: 'Active' },
  enterprise: { name: 'Enterprise', price: 249, msgs: Infinity, prods: Infinity, badge: 'b-on', btext: 'Active' }
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1e3)
  if (s < 60) return 'Just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function sendWhatsApp(to, text, token, phoneId) {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
    })
    return await res.json()
  } catch (err) {
    console.error('WhatsApp send error:', err)
    return { error: err.message }
  }
}

function genAIReply(input, profile, products, businessInfo) {
  const biz = profile?.business_name || 'our store'
  const low = input.toLowerCase()
  const loc = businessInfo?.address || 'our physical location'

  function prodList(max = 5) {
    if (products.length === 0) return "We're currently updating our catalog. Check back soon!"
    return products.slice(0, max).map((p, i) => `${i + 1}. ${p.name} — GH₵ ${p.price}`).join('\n')
  }

  let text = '', image = null, imgName = '', imgPrice = 0

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|hiya)/.test(low)) {
    text = `Welcome to ${biz}! I'm here to help.\n\nHere's what we have:\n${prodList()}\n\nWhat are you looking for?`
  } else if (/location|where|place|address|located|office|shop|branch|ghana/.test(low)) {
    text = `You can find us at ${loc}. We're happy to assist you there!\n\nWould you like to see our products or place an order?`
  } else if (/price|how much|cost|cheap|expensive|afford|budget/.test(low)) {
    text = `Here are our current prices:\n\n${prodList()}\n\nWhich one fits your budget? I can recommend the best value!`
    if (products.length > 0) {
      const match = products.find(p => low.includes(p.name.toLowerCase()))
      if (match) { image = match.image_url; imgName = match.name; imgPrice = match.price }
      else { const rp = products[Math.floor(Math.random() * products.length)]; image = rp.image_url; imgName = rp.name; imgPrice = rp.price }
    }
  } else if (/discount|deal|offer|reduce|lower|negotiate|barter/.test(low)) {
    text = `I appreciate you asking! We do offer discounts on bulk orders.\n\nBuy 2+ items and get 10% off. Which products interest you?\n\n${prodList(3)}`
  } else if (/delivery|ship|deliver|kumasi|accra|tamale/.test(low)) {
    text = `Yes, we deliver nationwide across Ghana! Delivery is usually within 1-3 business days depending on your location.\n\nIs there anything from our catalog you'd like to order?\n\n${prodList(3)}`
  } else if (/thank|thanks|bye|goodbye|okay|ok|great|nice/.test(low)) {
    text = `You're welcome! If you need anything else, just message me anytime. I'm always here to help at ${biz}. Have a great day!`
  } else if (/yes|want|order|buy|take|get|i'll|i will|interested/.test(low)) {
    const match = products.find(p => low.includes(p.name.toLowerCase()))
    if (match) {
      text = `Excellent choice! ${match.name} for GH₵ ${match.price}.\n\nPlease share your delivery location and phone number, and we'll get your order processed right away.`
      image = match.image_url; imgName = match.name; imgPrice = match.price
    } else {
      text = `Great! Which specific product would you like to order?\n\n${prodList()}\n\nJust let me know and I'll sort it out.`
      if (products.length > 0) {
        const rp = products[Math.floor(Math.random() * products.length)]; image = rp.image_url; imgName = rp.name; imgPrice = rp.price
      }
    }
  } else {
    text = `Thanks for your message! Let me help you with that.\n\nHere's what we offer at ${biz}:\n${prodList()}\n\nLet me know if anything catches your eye — I'm happy to give you more details!`
    if (products.length > 0) {
      const rp = products[Math.floor(Math.random() * products.length)]; image = rp.image_url; imgName = rp.name; imgPrice = rp.price
    }
  }

  return { text, image, imgName, imgPrice }
}

function groupMessagesForChat(messages) {
  const sorted = [...messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const pairs = []
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].role === 'user') {
      const reply = sorted[i + 1]?.role === 'assistant' ? sorted[i + 1] : null
      pairs.push({ message: sorted[i], reply, customer_number: sorted[i].customer_number })
      if (reply) i++
    }
  }
  return pairs
}

function getMsgCount(messages) {
  return messages.filter(m => m.role === 'assistant').length
}

function ManageUserModal({ open, userId, onAction, onClose }) {
  const [sub, setSub] = useState(null)
  const [newPlan, setNewPlan] = useState('')
  const [extendDays, setExtendDays] = useState(7)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && userId) {
      supabase.from('subscriptions').select('*').eq('user_id', userId).single().then(res => {
        if (!res.error) {
          setSub(res.data)
          setNewPlan(res.data.plan)
        }
      })
    }
  }, [open, userId])

  if (!open) return null

  const handlePlanUpdate = async () => {
    setLoading(true)
    await onAction('plan', newPlan)
    setLoading(false)
  }

  const handleExtend = async () => {
    setLoading(true)
    await onAction('extend', extendDays)
    setLoading(false)
  }

  const handleBan = async (status) => {
    if (window.confirm(`Are you sure you want to ${status === 'suspended' ? 'ban' : 'activate'} this user?`)) {
      setLoading(true)
      await onAction('ban', status)
      setLoading(false)
    }
  }

  return (
    <div className={`mo ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}><i className="fa-solid fa-user-gear" style={{ color: 'var(--ac)', marginRight: 10 }} /> Manage Account</h2>
          <button className="btn-g" style={{ padding: '6px 8px' }} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" style={{ fontSize: 18 }} /></button>
        </div>

        {sub ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'var(--bg2)', padding: 20, borderRadius: 14, border: '1px solid var(--brd)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', marginBottom: 4 }}>Plan</div><span className="badge b-on">{sub.plan}</span></div>
              <div><div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div><span className={`badge ${sub.status === 'active' ? 'b-on' : 'b-wrn'}`}>{sub.status}</span></div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', marginBottom: 4 }}>Expiry Date</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}><i className="fa-solid fa-calendar-day" style={{ marginRight: 6, color: 'var(--fg2)' }} /> {fmtDate(sub.expiry_date)}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <label className="fl"><i className="fa-solid fa-crown" style={{ marginRight: 6 }} /> Upgrade / Change Plan</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="fi" value={newPlan} onChange={e => setNewPlan(e.target.value)} style={{ flex: 1 }}>
                  <option value="starter">Starter Plan</option>
                  <option value="business">Business Plan</option>
                  <option value="enterprise">Enterprise Plan</option>
                </select>
                <button className="btn-p" style={{ padding: '10px 16px' }} disabled={loading} onClick={handlePlanUpdate}>Update</button>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <label className="fl"><i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 6 }} /> Extend Trial Period</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input type="number" className="fi" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} placeholder="Days" style={{ paddingRight: 40 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--fg3)' }}>days</span>
                </div>
                <button className="btn-s" style={{ padding: '10px 16px' }} disabled={loading} onClick={handleExtend}>Extend</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-d" style={{ flex: 1, padding: 12 }} disabled={loading || sub.status === 'suspended'} onClick={() => handleBan('suspended')}>
                <i className="fa-solid fa-ban" style={{ marginRight: 8 }} /> Suspend User
              </button>
              {sub.status === 'suspended' && (
                <button className="btn-p" style={{ flex: 1, padding: 12 }} disabled={loading} onClick={() => handleBan('active')}>
                  <i className="fa-solid fa-bolt" style={{ marginRight: 8 }} /> Reactivate
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div className="loader" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--fg2)' }}>Loading user data...</p>
          </div>
        )}
        
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--brd)' }}>
          <button className="btn-s" style={{ width: '100%', border: 'none' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default function AppShell({ user, profile, onUpdateProfile, onLogout, toast }) {
  const [view, setView] = useState('vDash')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [products, setProducts] = useState([])
  const [subscription, setSubscription] = useState(null)
  const [botSettings, setBotSettings] = useState(null)
  const [messages, setMessages] = useState([])
  const [waConnected, setWaConnected] = useState(false) // deprecated, kept for compatibility
  const [waNumber, setWaNumber] = useState('')
  const [msgCount, setMsgCount] = useState(0)
  const [selChat, setSelChat] = useState(null)

  const [prodModalOpen, setProdModalOpen] = useState(false)
  const [editProdId, setEditProdId] = useState(null)
  const [delProdId, setDelProdId] = useState(null)
  const [payMoOpen, setPayMoOpen] = useState(false)
  const [payPlan, setPayPlan] = useState(null)
  const [whMoOpen, setWhMoOpen] = useState(false)
  const [whSteps, setWhSteps] = useState([])
  const [whRef, setWhRef] = useState('')
  const [whAmt, setWhAmt] = useState(0)
  const [whDone, setWhDone] = useState(false)

  const [tbMessages, setTbMessages] = useState(() => {
    const saved = localStorage.getItem('bs_test_messages')
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    localStorage.setItem('bs_test_messages', JSON.stringify(tbMessages))
  }, [tbMessages])
  const [businessInfo, setBusinessInfo] = useState(null)
  const [orders, setOrders] = useState([])

  const planKey = subscription?.plan || 'starter'
  const planData = PLANS[planKey]
  const isExpired = () => subscription && subscription.status === 'expired'
  const isSubActive = () => subscription && subscription.status === 'active' && !isExpired()
  const canBotRun = () => isSubActive() && products.length > 0 && profile?.slug

  useEffect(() => {
    if (!user) return
    
    const channel = supabase
      .channel('dashboard_messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `business_id=eq.${user.id}`
      }, payload => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [user])
  const isAdmin = profile?.is_admin || user?.app_metadata?.is_admin === true
  console.log('Admin Status Check:', { profile: profile?.is_admin, metadata: user?.app_metadata?.is_admin })

  const [adminStats, setAdminStats] = useState(null)
  const [allUsers, setAllUsers] = useState([])
  const [allPayments, setAllPayments] = useState([])

  const fetchData = useCallback(async () => {
    if (!user) return

    const prodRes = supabase.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    const subRes = supabase.from('subscriptions').select('*').eq('user_id', user.id).single()
    const msgRes = supabase.from('messages').select('*').eq('business_id', user.id).order('created_at', { ascending: true }).limit(500)
    const waRes = supabase.from('whatsapp_connections').select('*').eq('user_id', user.id).limit(1).single()
    const bsRes = supabase.from('bot_settings').select('*').eq('user_id', user.id).single()
    const biRes = supabase.from('business_info').select('*').eq('user_id', user.id).single()
    const ordRes = supabase.from('orders').select('*').eq('business_id', user.id).order('created_at', { ascending: false }).limit(50)

    const [prod, sub, msg, wa, bs, bi, ord] = await Promise.all([prodRes, subRes, msgRes, waRes, bsRes, biRes, ordRes])

    if (!prod.error) setProducts(prod.data || [])
    if (!sub.error) setSubscription(sub.data)
    if (!msg.error) {
      setMessages(msg.data || [])
      setMsgCount(getMsgCount(msg.data || []))
    }
    if (!wa.error && wa.data) {
      setWaConnected(true)
      setWaNumber(wa.data.phone_number)
    }
    if (!bs.error && bs.data) setBotSettings(bs.data)
    if (!bi.error && bi.data) setBusinessInfo(bi.data)
    if (!ord.error) setOrders(ord.data || [])

    // Admin Data
    if (profile?.is_admin) {
      const [usersRes, paymentsRes, subsRes, msgsRes] = await Promise.all([
        supabase.from('profiles').select('id, email, business_name, created_at').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('subscriptions').select('*').eq('status', 'active'),
        supabase.from('messages').select('id', { count: 'exact', head: true })
      ])
      if (!usersRes.error) setAllUsers(usersRes.data || [])
      if (!paymentsRes.error) setAllPayments(paymentsRes.data || [])
      if (!subsRes.error) setAdminStats({
        totalUsers: usersRes.data?.length || 0,
        activeSubs: subsRes.data?.length || 0,
        totalMsgs: msgsRes.count || 0,
        revenue: paymentsRes.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
      })
    }
  }, [user])

  useEffect(() => { fetchData() }, [fetchData, profile])

  const switchView = (id) => { setView(id); setSidebarOpen(false) }

  const saveProduct = async (product) => {
    if (editProdId) {
      const { error } = await supabase.from('products').update(product).eq('id', editProdId)
      if (error) { toast(error.message, 'err'); return }
      toast('Product updated!')
    } else {
      const { data, error } = await supabase.from('products').insert([{ ...product, user_id: user.id }]).select().single()
      if (error) { toast(error.message, 'err'); return }
      setProducts(prev => [data, ...prev])
      toast('Product added!')
    }
    setProdModalOpen(false)
    setEditProdId(null)
    fetchData()
  }

  const deleteProduct = async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { toast(error.message, 'err'); return }
    setDelProdId(null)
    toast('Product deleted', 'info')
    fetchData()
  }

  const openProdModal = (id = null) => {
    setEditProdId(id)
    setProdModalOpen(true)
  }

  const saveBotSettings = async (settings) => {
    const { error } = await supabase.from('bot_settings').upsert({
      user_id: user.id,
      ...settings
    }, { onConflict: 'user_id' })
    if (error) { toast(error.message, 'err'); return false }
    setBotSettings(prev => ({ ...prev, ...settings }))
    return true
  }

  const saveBusinessInfo = async (info) => {
    const { error } = await supabase.from('business_info').upsert({
      user_id: user.id,
      ...info
    }, { onConflict: 'user_id' })
    if (error) { toast(error.message, 'err'); return false }
    setBusinessInfo(prev => ({ ...prev, ...info }))
    toast('Business info updated!')
    return true
  }

  const [waVerifyOpen, setWaVerifyOpen] = useState(false)
  const [waVerifyPhone, setWaVerifyPhone] = useState('')
  const [waVerifyId, setWaVerifyId] = useState('')
  const [waVerifyToken, setWaVerifyToken] = useState('')
  const [manageUserId, setManageUserId] = useState(null)

  const handleAdminAction = async (action, value) => {
    if (!manageUserId) return
    try {
      if (action === 'plan') {
        await supabase.from('subscriptions').update({ plan: value }).eq('user_id', manageUserId)
        toast(`User plan updated to ${value}`, 'info')
      } else if (action === 'extend') {
        const currentSub = await supabase.from('subscriptions').select('expiry_date').eq('user_id', manageUserId).single()
        const newDate = new Date(currentSub.data?.expiry_date || Date.now())
        newDate.setDate(newDate.getDate() + value) // value is days to add
        await supabase.from('subscriptions').update({ expiry_date: newDate.toISOString() }).eq('user_id', manageUserId)
        toast(`Trial extended by ${value} days`, 'info')
      } else if (action === 'ban') {
        await supabase.from('subscriptions').update({ status: value }).eq('user_id', manageUserId)
        toast(`User ${value === 'suspended' ? 'suspended' : 'activated'}`, 'info')
      }
      setManageUserId(null)
      fetchData() // Refresh stats
    } catch (err) {
      toast('Action failed: ' + err.message, 'err')
    }
  }

  const GHANA_PREFIXES = [
    '020', '024', '025', '026', '027',
    '050', '054', '055', '056', '057', '059',
    '030', '031'
  ]

  function validateGhanaNumber(raw) {
    const digits = raw.replace(/\s+/g, '')
    if (digits.length !== 10) return { valid: false, error: 'Phone number must be exactly 10 digits (e.g. 0241234567)' }
    if (!digits.startsWith('0')) return { valid: false, error: 'Number must start with 0 (Ghana national format)' }
    const prefix = digits.substring(0, 3)
    if (!GHANA_PREFIXES.includes(prefix)) return { valid: false, error: prefix + ' is not a valid Ghana mobile prefix' }
    return { valid: true, digits }
  }

  function formatToInternational(digits) {
    return '+233' + digits.substring(1)
  }

  const connectWA = async (phone, phoneId, accessToken) => {
    if (!isSubActive()) { toast('Your subscription is not active. Please subscribe to a plan first.', 'err'); switchView('vPlan'); return }
    if (products.length === 0) { toast('Add at least one product before connecting WhatsApp.', 'err'); switchView('vProd'); return }

    const check = validateGhanaNumber(phone)
    if (!check.valid) { toast(check.error, 'err'); return }

    const fullNumber = formatToInternational(check.digits)
    const { error } = await supabase.from('whatsapp_connections').upsert({
      user_id: user.id,
      phone_number: fullNumber,
      phone_id: phoneId, // User's unique Phone ID from Meta
      access_token: accessToken, // User's unique Token from Meta
      status: 'connected',
      provider: 'whatsapp',
      connected_at: new Date().toISOString()
    })
    if (error) { toast(error.message, 'err'); return }
    setWaConnected(true)
    setWaNumber(fullNumber)
    setWaVerifyOpen(false)
    toast('WhatsApp connected successfully!')
  }

  const initiateWAConnect = (phone, phoneId, accessToken) => {
    const check = validateGhanaNumber(phone)
    if (!check.valid) { toast(check.error, 'err'); return }
    setWaVerifyPhone(check.digits)
    setWaVerifyId(phoneId.trim())
    setWaVerifyToken(accessToken.trim())
    setWaVerifyOpen(true)
  }

  const disconnectWA = async () => {
    const { error } = await supabase.from('whatsapp_connections').delete().eq('user_id', user.id)
    if (error) { toast(error.message, 'err'); return }
    setWaConnected(false)
    setWaNumber('')
    toast('WhatsApp disconnected', 'info')
  }

  const openPay = (pk) => {
    if (planKey === pk) { toast('Already on this plan', 'info'); return }
    setPayPlan(pk)
    setPayMoOpen(true)
  }

  const doPay = () => {
    const pk = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
    if (!pk) { toast('Paystack public key not configured', 'err'); return }

    const pl = PLANS[payPlan]
    const paystack = new PaystackPop()

    paystack.newTransaction({
      key: pk,
      email: user?.email,
      amount: pl.price * 100,
      currency: 'GHS',
      ref: 'BS_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10),
      callback: async (response) => {
        setPayMoOpen(false)
        await processPaymentSuccess(payPlan, response.reference, pl.price)
      },
      onClose: () => {
        toast('Payment cancelled', 'info')
      }
    })
  }

  const processPaymentSuccess = async (plan, reference, amount) => {
    setWhRef(reference)
    setWhAmt(amount * 100)
    setWhSteps([])
    setWhDone(false)
    setWhMoOpen(true)

    const steps = [
      { text: 'Webhook received from Paystack', delay: 600 },
      { text: 'Verifying payment signature...', delay: 1200 },
      { text: 'Payment verified successfully', delay: 1800 },
      { text: 'Updating subscriptions table in Supabase...', delay: 2400 },
      { text: `Setting plan = ${plan}, status = active`, delay: 3000 },
      { text: 'Setting expiry_date = ' + fmtDate(new Date(Date.now() + 30 * 864e5)), delay: 3600 },
      { text: 'Bot activation signal sent', delay: 4200 }
    ]

    const newSteps = []
    steps.forEach(s => {
      setTimeout(() => {
        newSteps.push(s.text)
        setWhSteps([...newSteps])
      }, s.delay)
    })

    setTimeout(async () => {
      const planPrice = PLANS[plan]?.price || 0
      const chargedAmount = Number(amount)

      if (planPrice > 0 && Math.abs(chargedAmount - planPrice) > 0.01) {
        toast('Payment amount mismatch: expected GHS ' + planPrice + ', got GHS ' + amount, 'err')
        return
      }

      const { error: payError } = await supabase.from('payments').insert([{
        user_id: user.id,
        paystack_reference: reference,
        amount: chargedAmount,
        currency: 'GHS',
        status: 'success',
        plan,
        metadata: JSON.stringify({ source: 'frontend', expected_amount: planPrice })
      }])

      if (payError) { toast(payError.message, 'err'); return }

      const { error } = await supabase.from('subscriptions').upsert({
        user_id: user.id,
        plan,
        status: 'active',
        expiry_date: new Date(Date.now() + 30 * 864e5).toISOString(),
        paystack_reference: reference,
        amount_paid: amount,
        messages_used: subscription?.messages_used || 0
      }, { onConflict: 'user_id' })

      if (error) { toast(error.message, 'err'); return }

      const { data } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).single()
      if (data) setSubscription(data)

      setWhDone(true)
    }, 4800)
  }

  const closeWH = () => {
    setWhMoOpen(false)
    toast('Payment successful! Upgraded to ' + PLANS[planKey].name)
  }

  const startBotTest = () => {
    switchView('vBotTest')
    setTbMessages([{ from: 'bot', text: profile?.greeting || 'Hello! How can I help you today?' }])
  }

  const sendBotMsg = async (text) => {
    if (!text.trim()) return

    const { data: canSend } = await supabase.rpc('use_message', { biz_id: user.id })
    if (!canSend) {
      setTbMessages(prev => [...prev, { from: 'user', text }, { from: 'bot', text: "Sorry, I've reached the monthly message limit for your plan or your subscription has expired. Please upgrade to continue." }])
      toast('Message limit reached or subscription expired.', 'err')
      return
    }

    setTbMessages(prev => [...prev, { from: 'user', text }])

    setTimeout(async () => {
      const reply = genAIReply(text, profile, products, businessInfo)
      const botMsg = { from: 'bot', text: reply.text }
      if (reply.image && planKey !== 'starter') {
        botMsg.image = reply.image
        botMsg.imgName = reply.imgName
        botMsg.imgPrice = reply.imgPrice
      }
      setTbMessages(prev => [...prev, botMsg])

      const now = new Date().toISOString()
      const customerNum = '+233 20 555 1234'

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('business_id', user.id)
        .eq('customer_number', customerNum)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const conversationId = lastMsg?.conversation_id || crypto.randomUUID()

      const { error } = await supabase.from('messages').insert([
        { business_id: user.id, customer_number: customerNum, conversation_id: conversationId, role: 'user', content: text, metadata: JSON.stringify({ source: 'test' }) },
        { business_id: user.id, customer_number: customerNum, conversation_id: conversationId, role: 'assistant', content: reply.text, metadata: JSON.stringify({ products_suggested: products.slice(0, 3).map(p => p.name), source: 'test' }) }
      ])

      if (error) console.error('Failed to save messages:', error)

      setMessages(prev => [
        ...prev,
        { id: 'm_' + Date.now(), business_id: user.id, customer_number: customerNum, conversation_id: conversationId, role: 'user', content: text, created_at: now },
        { id: 'm_' + (Date.now() + 1), business_id: user.id, customer_number: customerNum, conversation_id: conversationId, role: 'assistant', content: reply.text, created_at: now }
      ])

      setMsgCount(prev => prev + 1)
      if (subscription) setSubscription(prev => ({ ...prev, messages_used: (prev.messages_used || 0) + 1 }))
    }, 800 + Math.random() * 800)
  }

  const handleManualReply = async (customerNum, text) => {
    if (!text.trim()) return

    const { data: lastMsg } = await supabase.from('messages').select('conversation_id').eq('business_id', user.id).eq('customer_number', customerNum).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const conversationId = lastMsg?.conversation_id || crypto.randomUUID()

    const { data: newMsg, error } = await supabase.from('messages').insert({
      business_id: user.id,
      customer_number: customerNum,
      conversation_id: conversationId,
      role: 'assistant',
      content: text,
      metadata: JSON.stringify({ source: 'dashboard_manual' })
    }).select().single()

    if (error) console.error('Error saving manual message:', error)
    else if (newMsg) {
      setMessages(prev => [...prev, newMsg])
      toast('Message sent!', 'ok')
    }
  }

  const handleClearAllMessages = async () => {
    if (!window.confirm('Are you sure you want to delete ALL message history for your business? This cannot be undone.')) return
    try {
      const { error } = await supabase.from('messages').delete().eq('business_id', profile.id)
      if (error) throw error
      setMessages([])
      setSelChat(null)
      toast('All messages cleared!', 'ok')
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  const handleClearSingleChat = async (customerNumber) => {
    if (!window.confirm(`Delete all messages with ${customerNumber}?`)) return
    try {
      const { error } = await supabase.from('messages').delete().eq('business_id', profile.id).eq('customer_number', customerNumber)
      if (error) throw error
      setMessages(prev => prev.filter(m => m.customer_number !== customerNumber))
      if (selChat === customerNumber) setSelChat(null)
      toast('Conversation deleted', 'ok')
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  return (
    <div className="page active">
      <button className="mtg" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
        <i className="fa-solid fa-bars" />
      </button>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--brd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--ac)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-robot" style={{ color: '#000', fontSize: 18 }} />
            </div>
            <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 17 }}>BotSeller</span>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          <div style={{ padding: '0 20px 8px', fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Main</div>
          <SidebarItem icon="fa-grid-2" label="Dashboard" view="vDash" currentView={view} onClick={switchView} />
          <SidebarItem icon="fa-box" label="Products" view="vProd" currentView={view} onClick={switchView} />
          <SidebarItem icon="fa-comments" label="Chats" view="vChat" currentView={view} onClick={switchView} badge={messages.length > 0 ? Math.ceil(messages.length / 2) : null} />
          <div style={{ padding: '16px 20px 8px', fontSize: 11, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Setup</div>
          <SidebarItem icon="fa-link" label="My Storefront" view="vStore" currentView={view} onClick={switchView} />
          <SidebarItem icon="fa-crown" label="Subscription" view="vPlan" currentView={view} onClick={switchView} />
          {isAdmin && <SidebarItem icon="fa-shield-halved" label="System Admin" view="vAdmin" currentView={view} onClick={switchView} />}
          <SidebarItem icon="fa-bag-shopping" label="Orders" view="vOrders" currentView={view} onClick={switchView} badge={orders.filter(o => o.status === 'pending').length > 0 ? orders.filter(o => o.status === 'pending').length : null} />
          <SidebarItem icon="fa-wand-magic-sparkles" label="Bot Settings" view="vBotSet" currentView={view} onClick={switchView} />
          <SidebarItem icon="fa-gear" label="Settings" view="vSet" currentView={view} onClick={switchView} />
        </nav>
        <div style={{ padding: 16, borderTop: '1px solid var(--brd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--acg)', border: '1px solid var(--ac3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--ac)', fontSize: 14 }}>
              {profile?.business_name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.business_name}</div>
              <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{user?.email}</div>
            </div>
            <button className="btn-g" style={{ padding: 6 }} onClick={onLogout} title="Sign out" aria-label="Sign out">
              <i className="fa-solid fa-right-from-bracket" style={{ fontSize: 14, color: 'var(--fg3)' }} />
            </button>
          </div>
        </div>
      </aside>

      <main className="mc">
        {view === 'vDash' && (
          <Dashboard
            profile={profile} subscription={subscription} products={products} messages={messages}
            msgCount={msgCount} planData={planData} planKey={planKey}
            isExpired={isExpired} isSubActive={isSubActive} canBotRun={canBotRun}
            onNavigate={switchView} orders={orders}
          />
        )}
        {view === 'vProd' && (
          <ProductsView
            products={products} planData={planData}
            onAdd={() => openProdModal()} onEdit={openProdModal} onDelete={setDelProdId}
          />
        )}
        {view === 'vChat' && (
          <ChatsView 
            messages={messages} 
            selChat={selChat} 
            onSelectChat={setSelChat} 
            onReply={handleManualReply} 
            onClearAll={handleClearAllMessages}
            onClearSingle={handleClearSingleChat}
          />
        )}
        {view === 'vStore' && (
          <StorefrontView 
            profile={profile} 
            onUpdateProfile={onUpdateProfile} 
            toast={toast}
          />
        )}
        {view === 'vPlan' && (
          <PlansView
            planKey={planKey} planData={planData} subscription={subscription}
            msgCount={msgCount} isExpired={isExpired}
            onUpgrade={openPay}
          />
        )}
        {view === 'vBotSet' && (
          <BotSettingsView settings={botSettings} onSave={saveBotSettings} toast={toast} />
        )}
        {view === 'vOrders' && (
          <OrdersView orders={orders} />
        )}
        {isAdmin && view === 'vAdmin' && (
          <AdminDashboard user={user} profile={profile} onLogout={onLogout} toast={toast} standalone={false} />
        )}

        {view === 'vSet' && (
          <SettingsView profile={profile} onUpdateProfile={onUpdateProfile} businessInfo={businessInfo} onSaveInfo={saveBusinessInfo} />
        )}
        {view === 'vBotTest' && (
          <BotTestView
            profile={profile} products={products} planKey={planKey}
            subscription={subscription} isExpired={isExpired}
            isSubActive={isSubActive} productsLength={products.length}
            messages={tbMessages} onSend={sendBotMsg} onBack={() => switchView('vDash')}
          />
        )}
      </main>

      <ProductModal
        open={prodModalOpen} onClose={() => { setProdModalOpen(false); setEditProdId(null); }}
        editId={editProdId} products={products} onSave={saveProduct} toast={toast} planData={planData} productsCount={products.length}
        userId={user.id}
      />

      <DeleteModal open={delProdId !== null} onCancel={() => setDelProdId(null)} onConfirm={() => deleteProduct(delProdId)} />

      <PaymentModal
        open={payMoOpen} onClose={() => setPayMoOpen(false)} plan={payPlan} planData={PLANS[payPlan]}
        userEmail={user?.email} onPay={doPay}
      />

      <WebhookModal open={whMoOpen} steps={whSteps} refCode={whRef} amount={whAmt} done={whDone} onClose={closeWH} />

      <WaVerifyModal
        open={waVerifyOpen}
        phone={waVerifyPhone}
        onConfirm={() => connectWA(waVerifyPhone, waVerifyId, waVerifyToken)}
        onCancel={() => setWaVerifyOpen(false)}
      />

      <ManageUserModal
        open={!!manageUserId}
        userId={manageUserId}
        onAction={handleAdminAction}
        onClose={() => setManageUserId(null)}
      />
    </div>
  )
}

function SidebarItem({ icon, label, view, currentView, onClick, badge }) {
  return (
    <div className={`sl ${currentView === view ? 'on' : ''}`} data-v={view} onClick={() => onClick(view)}>
      <i className={`fa-solid ${icon}`} />
      {label}
      {badge && <span style={{ marginLeft: 'auto', background: 'var(--ac)', color: '#000', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10 }}>{badge}</span>}
    </div>
  )
}

function Dashboard({ profile, subscription, products, messages, msgCount, planData, planKey, isExpired, isSubActive, canBotRun, onNavigate, orders }) {
  const lim = planData.msgs
  const pct = lim === Infinity ? 0 : Math.min((msgCount / lim) * 100, 100)
  const botColor = canBotRun() ? 'var(--ac)' : 'var(--fg3)'
  const botText = canBotRun() ? 'Active' : 'Off'
  const replyRate = messages.length > 0 ? '87%' : '0%'
  const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0
  const totalOrders = orders?.length || 0

  const pairs = groupMessagesForChat(messages)
  const recentPairs = pairs.slice(-4).reverse()

  const daysLeft = Math.max(0, Math.ceil((new Date(subscription?.expiry_date) - new Date()) / 864e5))

  return (
    <div className="av" id="vDash" style={{ display: 'block' }}>
      {isExpired() && (
        <div className="exp-banner">
          <i className="fa-solid fa-circle-exclamation" style={{ color: 'var(--red)', fontSize: 20 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--red)' }}>Subscription Expired</div>
            <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 2 }}>Your bot has been deactivated. Renew your plan to resume selling on Web Chat.</div>
          </div>
          <button className="btn-p" style={{ padding: '10px 20px', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => onNavigate('vPlan')}>Renew Plan</button>
        </div>
      )}
      {planKey === 'starter' && !isExpired() && daysLeft <= 3 && (
        <div className="exp-banner" style={{ background: 'linear-gradient(90deg,rgba(245,158,11,.12),rgba(245,158,11,.03))', borderColor: 'rgba(245,158,11,.25)' }}>
          <i className="fa-solid fa-clock" style={{ color: 'var(--warn)', fontSize: 20 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--warn)' }}>Trial expires in {daysLeft} day{daysLeft > 1 || daysLeft === 0 ? 's' : ''}</div>
            <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 2 }}>Upgrade to keep your bot running after the trial ends.</div>
          </div>
          <button className="btn-p" style={{ padding: '10px 20px', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => onNavigate('vPlan')}>Upgrade Now</button>
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Overview of your AI Chat Storefront</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16, marginBottom: 28 }}>
        <Stat icon="fa-comments" iconColor="var(--ac)" iconBg="var(--acg)" value={msgCount} label="AI Conversations" />
        <Stat icon="fa-box" iconColor="var(--info)" iconBg="rgba(6,182,212,.15)" value={products.length} label="Active products" />
        <Stat icon="fa-bolt" iconColor="var(--warn)" iconBg="rgba(245,158,11,.15)" value={botText} label="Store status" valueColor={botColor} />
        <Stat icon="fa-bag-shopping" iconColor="#22c55e" iconBg="rgba(34,197,94,.15)" value={pendingOrders > 0 ? `${pendingOrders} pending` : `${totalOrders} total`} label="Orders" />
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Conversation Usage</span>
          <span style={{ fontSize: 13, color: 'var(--fg2)' }}>{lim === Infinity ? msgCount + ' messages (unlimited)' : msgCount + ' / ' + lim + ' messages'}</span>
        </div>
        <div className="pbar"><div className="pfill" style={{ width: pct + '%', background: pct > 80 ? 'var(--red)' : 'var(--ac)' }} /></div>
        <p style={{ fontSize: 12, color: 'var(--fg3)', marginTop: 8 }}>{pct > 80 ? 'Running low! Upgrade now.' : planKey === 'starter' ? 'Upgrade your plan for more capacity' : 'You have plenty of capacity remaining'}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-s" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => onNavigate('vProd')}><i className="fa-solid fa-plus" style={{ color: 'var(--ac)' }} /> Add New Product</button>
            <button className="btn-s" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => window.open(`${window.location.origin}/chat/${profile?.slug || profile?.business_name?.toLowerCase().replace(/ /g, '-')}`, '_blank')}><i className="fa-solid fa-eye" style={{ color: 'var(--ac)' }} /> View My Storefront</button>
            <button className="btn-s" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => onNavigate('vPlan')}><i className="fa-solid fa-crown" style={{ color: 'var(--ac)' }} /> Upgrade Plan</button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recent Conversations</h3>
          {!recentPairs.length ? (
            <p style={{ color: 'var(--fg3)', fontSize: 13 }}>No conversations yet. Share your storefront link to start!</p>
          ) : (
            recentPairs.map((p, i) => {
              const name = p.customer_number.replace('+233 ', 'Customer ')
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={el => { el.currentTarget.style.background = 'rgba(255,255,255,.03)' }}
                  onMouseLeave={el => { el.currentTarget.style.background = 'transparent' }}
                  onClick={() => onNavigate('vChat')}
                >
                  <div style={{ width: 32, height: 32, background: 'var(--acg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ac)', flexShrink: 0 }}>{name.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.message.content}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--fg3)', whiteSpace: 'nowrap' }}>{timeAgo(p.message.created_at)}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, iconColor, iconBg, value, label, valueColor }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div className="si" style={{ background: iconBg }}><i className={`fa-solid ${icon}`} style={{ color: iconColor }} /></div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Space Grotesk'", color: valueColor || undefined }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--fg2)' }}>{label}</div>
      </div>
    </div>
  )
}

function OrdersView({ orders }) {
  const statusBadge = (s) => {
    if (s === 'pending') return <span className="badge b-wrn">Pending</span>
    if (s === 'completed') return <span className="badge b-on">Completed</span>
    if (s === 'cancelled') return <span className="badge" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--red)' }}>Cancelled</span>
    return null
  }

  return (
    <div className="av" id="vOrders" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Orders</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Customer orders placed via Web Chat</p></div>
      {!orders.length ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <i className="fa-solid fa-bag-shopping" style={{ fontSize: 48, color: 'var(--fg3)', marginBottom: 16, display: 'block' }} />
          <p style={{ color: 'var(--fg2)', fontSize: 15 }}>No orders yet. Orders will appear here when customers buy via Web Chat.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(o => (
            <div key={o.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, background: 'var(--acg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: 'var(--ac)', flexShrink: 0 }}>
                  {(o.customer_name || o.customer_phone).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{o.customer_name || 'Customer'}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg3)' }}>{o.customer_phone} · {fmtDate(o.created_at)}</div>
                  {o.delivery_address && <div style={{ fontSize: 12, color: 'var(--fg2)', marginTop: 4 }}><i className="fa-solid fa-location-dot" style={{ color: 'var(--ac)', marginRight: 4 }} /> {o.delivery_address}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ac)', fontFamily: "'Space Grotesk'" }}>GH₵ {o.total?.toFixed(2) || '0.00'}</div>
                <div style={{ marginTop: 4 }}>{statusBadge(o.status)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProductsView({ products, planData, onAdd, onEdit, onDelete }) {
  if (!products.length) {
    return (
      <div className="av" id="vProd" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Products</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Manage your product catalog</p></div>
          <button className="btn-p" onClick={onAdd}><i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Add Product</button>
        </div>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <i className="fa-solid fa-box-open" style={{ fontSize: 48, color: 'var(--fg3)', marginBottom: 16, display: 'block' }} />
          <p style={{ color: 'var(--fg2)', fontSize: 15, marginBottom: 16 }}>No products yet. Add your first product to get started.</p>
          <button className="btn-p" onClick={onAdd}>Add First Product</button>
        </div>
      </div>
    )
  }

  return (
    <div className="av" id="vProd" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Products</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Manage your product catalog</p></div>
        <button className="btn-p" onClick={onAdd}><i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Add Product</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {products.map(p => (
          <div key={p.id} className="card" style={{ position: 'relative' }}>
            {p.image_url && <div style={{ height: 140, background: 'var(--bg2)', borderRadius: 8, marginBottom: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ac)', fontFamily: "'Space Grotesk'", marginBottom: 8 }}>GH₵ {Number(p.price).toFixed(2)}</div>
            {p.description && <p style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 12, lineHeight: 1.5 }}>{p.description}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-s" style={{ flex: 1, padding: '6px 12px', fontSize: 13 }} onClick={() => onEdit(p.id)}>Edit</button>
              <button className="btn-d" style={{ flex: 1, padding: '6px 12px', fontSize: 13 }} onClick={() => onDelete(p.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatsView({ messages, selChat, onSelectChat, onReply, onClearAll, onClearSingle }) {
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [selChat, messages])

  const handleSend = () => {
    if (!input.trim()) return
    onReply(selChat, input)
    setInput('')
  }

  const customerMap = {}
  messages.forEach(m => {
    if (!customerMap[m.customer_number]) customerMap[m.customer_number] = []
    customerMap[m.customer_number].push(m)
  })

  let entries = Object.entries(customerMap).map(([num, msgs]) => {
    const sorted = msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const last = sorted[sorted.length - 1]
    const conversations = [...new Set(msgs.map(m => m.conversation_id))]
    return { num, msgs: sorted, last, conversationCount: conversations.length }
  })
  entries.sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at))

  const selected = selChat ? entries.find(e => e.num === selChat) : null

  return (
    <div className="av" id="vChat" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Chats</h1>
          <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Customer conversations handled by your bot</p>
        </div>
        {messages.length > 0 && (
          <button className="btn-g" onClick={onClearAll} style={{ color: 'var(--red)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <i className="fa-solid fa-trash-can" style={{ marginRight: 8 }} /> Clear All History
          </button>
        )}
      </div>
      
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', border: '1px solid var(--brd)', borderRadius: 14, overflow: 'hidden', background: 'var(--bg2)' }}>
        {/* Sidebar */}
        <div style={{ borderRight: '1px solid var(--brd)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--brd)' }}>
            <input type="text" className="fi" placeholder="Search chats..." style={{ padding: '10px 14px', fontSize: 13 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!entries.length ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}><p style={{ color: 'var(--fg3)', fontSize: 13 }}>{messages.length ? 'No matching chats' : 'No conversations yet'}</p></div>
            ) : entries.map(e => {
              const name = e.num.replace('+233 ', 'Customer ')
              return (
                <div key={e.num} onClick={() => onSelectChat(e.num)}
                  style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--brd)', transition: 'background .15s', background: selChat === e.num ? 'var(--acg)' : 'transparent' }}
                  onMouseEnter={el => { if (selChat !== e.num) el.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
                  onMouseLeave={el => { if (selChat !== e.num) el.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, background: 'var(--acg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--ac)', flexShrink: 0 }}>{name.charAt(0)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg3)' }}>{timeAgo(e.last.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.last.content}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#0b141a', position: 'relative', overflow: 'hidden' }}>
          {selected ? (
            <>
              <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, background: 'var(--acg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>{selected.num.charAt(0)}</div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.num.replace('+233 ', 'Customer ')}</span>
                </div>
                <button 
                  className="btn-g" 
                  onClick={() => onClearSingle(selected.num)} 
                  title="Delete this conversation"
                  style={{ padding: '6px 10px', fontSize: 12, color: 'var(--fg3)' }}
                >
                  <i className="fa-solid fa-trash-can" style={{ marginRight: 6 }} /> Delete Chat
                </button>
              </div>
              <div style={{ background: 'var(--bg2)', padding: '14px 20px', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, background: 'var(--acg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>{selChat.replace('+233 ', 'C').charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selChat.replace('+233 ', 'Customer ')}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg3)' }}>{selChat}</div>
                </div>
                <span className="badge b-on">{selected.conversationCount} chat{selected.conversationCount > 1 ? 's' : ''}</span>
              </div>
              
              <div ref={scrollRef} style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selected.msgs.map(m => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-start' : 'flex-end' }}>
                    <div className={m.role === 'user' ? 'cbi' : 'cbo'} style={{ whiteSpace: 'pre-line', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>{escHtml(m.content)}</div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4, padding: '0 4px' }}>
                      {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {m.role === 'assistant' && ' · Bot'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderTop: '1px solid var(--brd)' }}>
                <div className="wi" style={{ background: 'var(--bg3)', borderRadius: 12, padding: '4px 8px 4px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="text"
                    placeholder="Reply to customer..."
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 14, padding: '10px 0', outline: 'none' }}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                  />
                  <button className="btn-p" style={{ padding: '8px 12px', borderRadius: 10 }} onClick={handleSend}>
                    <i className="fa-solid fa-paper-plane" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <i className="fa-solid fa-comments" style={{ fontSize: 48, color: 'var(--fg3)', marginBottom: 16, display: 'block' }} />
                <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StorefrontView({ profile, onUpdateProfile, toast }) {
  const [slug, setSlug] = useState(profile?.slug || '')
  const storeUrl = `${window.location.origin}/chat/${slug || profile?.business_name?.toLowerCase().replace(/ /g, '-')}`

  const handleSaveSlug = () => {
    if (!slug.trim()) { toast('Slug cannot be empty', 'err'); return }
    const cleanSlug = slug.trim().toLowerCase().replace(/ /g, '-')
    onUpdateProfile({ ...profile, slug: cleanSlug })
  }

  const copyLink = () => {
    navigator.clipboard.writeText(storeUrl)
    toast('Store link copied!', 'ok')
  }

  return (
    <div className="av" id="vStore" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>My Storefront</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Manage your public AI chat link and QR code</p></div>
      
      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Store Link & Slug</h3>
          <p style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 20 }}>This is your unique link. You can put this in your Instagram bio, Facebook page, or send it to customers.</p>
          
          <div style={{ marginBottom: 20 }}>
            <label className="fl">Custom Store Slug</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input 
                type="text" 
                className="fi" 
                value={slug} 
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} 
                placeholder="e.g. abdul-store" 
              />
              <button className="btn-p" onClick={handleSaveSlug}>Save</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 8 }}>Only letters, numbers, and dashes allowed.</p>
          </div>

          <div style={{ background: 'var(--bg2)', padding: 16, borderRadius: 12, border: '1px solid var(--brd)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: 'var(--ac)' }}>
              {storeUrl}
            </div>
            <button className="btn-s" style={{ padding: '8px 16px', fontSize: 12 }} onClick={copyLink}>Copy Link</button>
          </div>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Store QR Code</h3>
          <p style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 24 }}>Customers can scan this code in your physical shop to start chatting with your AI assistant.</p>
          
          <div style={{ width: 180, height: 180, background: '#fff', padding: 10, borderRadius: 12, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(storeUrl)}`} alt="Store QR" style={{ width: '100%', height: '100%' }} />
          </div>
          
          <button className="btn-s" onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(storeUrl)}`, '_blank')}>
            <i className="fa-solid fa-download" style={{ marginRight: 8 }} /> Download QR Code
          </button>
        </div>
      </div>
    </div>
  )
}

function PlansView({ planKey, planData, subscription, msgCount, isExpired, onUpgrade }) {
  const daysLeft = Math.max(0, Math.ceil((new Date(subscription?.expiry_date) - new Date()) / 864e5))
  const lim = planData.msgs

  return (
    <div className="av" id="vPlan" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Subscription</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Manage your plan and billing</p></div>
      <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Current Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk'" }}>{planData.name}</span>
            <span className={`badge ${planData.badge}`}>{planData.btext}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: isExpired() ? 'var(--red)' : 'var(--fg2)' }}>{isExpired() ? 'Expired on ' + fmtDate(subscription.expiry_date) : planKey === 'starter' ? 'Expires in ' + daysLeft + ' day' + (daysLeft > 1 || daysLeft === 0 ? 's' : '') : 'Renews monthly'}</div>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginTop: 2 }}>{lim === Infinity ? msgCount + ' messages (unlimited)' : msgCount + ' / ' + lim + ' messages used'}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20, maxWidth: 900 }}>
        {['starter', 'business', 'enterprise'].map(k => {
          const pl = PLANS[k]
          const isCurrent = planKey === k
          const features = {
            starter: ['50 messages/month', '10 products max', 'Basic AI text only'],
            business: ['2,000 messages/month', 'Unlimited products', 'AI sends product images', 'Chat analytics'],
            enterprise: ['Unlimited messages', 'Unlimited products', 'Advanced AI training', 'Priority support']
          }
          return (
            <div key={k} className={`card ${k === 'business' ? 'ph' : ''}`} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: k === 'business' ? 'var(--ac)' : 'var(--fg2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{pl.name}</div>
              <div style={{ fontSize: 38, fontWeight: 700, fontFamily: "'Space Grotesk'", marginBottom: 4 }}>
                {pl.price === 0 ? 'Free' : <>GH₵ {pl.price}<span style={{ fontSize: 15, fontWeight: 400, color: 'var(--fg2)' }}>/mo</span></>}
              </div>
              <div style={{ color: 'var(--fg3)', fontSize: 13, marginBottom: 20 }}>{k === 'starter' ? '7-day trial' : k === 'business' ? 'Best for growing stores' : 'High-volume stores'}</div>
              <ul style={{ textAlign: 'left', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {features[k].map((f, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--fg2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-check" style={{ color: 'var(--ac)', fontSize: 11 }} /> {f}
                  </li>
                ))}
              </ul>
              <button
                className={isCurrent ? (k === 'business' ? 'btn-p' : 'btn-s') : (k === 'business' ? 'btn-p' : 'btn-s')}
                style={{ width: '100%' }}
                disabled={isCurrent}
                onClick={() => onUpgrade(k)}
              >
                {isCurrent ? 'Current Plan' : (k === 'starter' ? 'Downgrade' : 'Upgrade to ' + pl.name)}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsView({ profile, onUpdateProfile, businessInfo, onSaveInfo }) {
  const [biz, setBiz] = useState(profile?.business_name || '')
  const [greeting, setGreeting] = useState(profile?.greeting || '')
  const [address, setAddress] = useState(businessInfo?.address || '')
  const [location, setLocation] = useState(businessInfo?.location || '')
  const [deliveryHours, setDeliveryHours] = useState(businessInfo?.delivery_hours || '')
  const [paymentInstructions, setPaymentInstructions] = useState(businessInfo?.payment_instructions || '')
  const [deliveryFee, setDeliveryFee] = useState(businessInfo?.delivery_fee || '')
  const [returnPolicy, setReturnPolicy] = useState(businessInfo?.return_policy || '')

  const handleSave = async () => {
    if (!biz.trim()) return
    await onUpdateProfile({ ...profile, business_name: biz.trim(), greeting: greeting.trim() })
  }

  const handleSaveInfo = async () => {
    await onSaveInfo({ address, location, delivery_hours: deliveryHours, payment_instructions: paymentInstructions, delivery_fee: deliveryFee, return_policy: returnPolicy })
  }

  return (
    <div className="av" id="vSet" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Settings</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Manage your account, business info, and bot configuration</p></div>
      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Business Profile</h3>
          <div style={{ marginBottom: 20 }}><label className="fl">Business Name</label><input type="text" className="fi" value={biz} onChange={e => setBiz(e.target.value)} placeholder="Your business name" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Email</label><input type="email" className="fi" value={profile?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Bot Greeting Message</label><textarea className="fi" value={greeting} onChange={e => setGreeting(e.target.value)} rows={3} placeholder="Hello! Welcome to our store. How can I help you today?" style={{ resize: 'vertical' }} /></div>
          <button className="btn-p" onClick={handleSave}>Save Changes</button>
        </div>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Business Information <span style={{ fontSize: 12, color: 'var(--fg3)', fontWeight: 400 }}>(Used by AI to answer customer questions)</span></h3>
          <div style={{ marginBottom: 20 }}><label className="fl">Business Address</label><input type="text" className="fi" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 123 Oxford Street" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Location / Area</label><input type="text" className="fi" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Accra, Osu" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Delivery Hours</label><input type="text" className="fi" value={deliveryHours} onChange={e => setDeliveryHours(e.target.value)} placeholder="e.g. Mon-Sat 9am - 6pm" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Delivery Fee</label><input type="text" className="fi" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} placeholder="e.g. GH₵ 10 within Accra" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Payment Instructions</label><textarea className="fi" value={paymentInstructions} onChange={e => setPaymentInstructions(e.target.value)} rows={3} placeholder="e.g. Send to MTN MoMo 0241234567 (Abdul) or Cash on Delivery" /></div>
          <div style={{ marginBottom: 20 }}><label className="fl">Return Policy</label><textarea className="fi" value={returnPolicy} onChange={e => setReturnPolicy(e.target.value)} rows={2} placeholder="e.g. No returns after 24 hours unless damaged" /></div>
          <button className="btn-p" onClick={handleSaveInfo}>Save Business Info</button>
        </div>
        <div className="card" style={{ borderColor: 'rgba(239,68,68,.2)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--red)' }}>Danger Zone</h3>
          <p style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 16 }}>Permanently delete your account and all data. This cannot be undone.</p>
          <button className="btn-d" disabled style={{ opacity: 0.5 }}>Delete Account</button>
        </div>
      </div>
    </div>
  )
}

function BotSettingsView({ settings, onSave, toast }) {
  const [tone, setTone] = useState(settings?.tone || 'friendly')
  const [style, setStyle] = useState(settings?.style || 'concise')
  const [strategy, setStrategy] = useState(settings?.sales_strategy || 'consultative')
  const [maxWords, setMaxWords] = useState(settings?.max_response_words || 150)
  const [language, setLanguage] = useState(settings?.language || 'en')
  const [instructions, setInstructions] = useState(settings?.custom_instructions || '')
  const [groqKey, setGroqKey] = useState(settings?.groq_api_key || '')

  const handleSave = async () => {
    const result = await onSave({ 
      tone, 
      style, 
      sales_strategy: strategy, 
      max_response_words: maxWords, 
      language, 
      custom_instructions: instructions,
      groq_api_key: groqKey
    })
    if (result) toast('Bot settings saved!')
  }

  return (
    <div className="av" id="vBotSet" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28 }}><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Bot Settings</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Configure how your AI assistant behaves and responds</p></div>
      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>AI Personality</h3>
          <div style={{ marginBottom: 20 }}><label className="fl">Tone</label>
            <select className="fi" value={tone} onChange={e => setTone(e.target.value)}>
              <option value="friendly">Friendly and warm</option>
              <option value="professional">Professional and formal</option>
              <option value="energetic">Energetic and enthusiastic</option>
              <option value="casual">Casual and relaxed</option>
            </select>
          </div>
          <div style={{ marginBottom: 20 }}><label className="fl">Response Style</label>
            <select className="fi" value={style} onChange={e => setStyle(e.target.value)}>
              <option value="concise">Concise (short answers)</option>
              <option value="detailed">Detailed (comprehensive)</option>
              <option value="conversational">Conversational (natural flow)</option>
            </select>
          </div>
          <div style={{ marginBottom: 20 }}><label className="fl">Sales Strategy</label>
            <select className="fi" value={strategy} onChange={e => setStrategy(e.target.value)}>
              <option value="consultative">Consultative (ask questions, recommend)</option>
              <option value="direct">Direct (straight to the point)</option>
              <option value="upsell">Upsell (suggest premium options)</option>
            </select>
          </div>
          <div style={{ marginBottom: 20 }}><label className="fl">Max Response Length (words)</label>
            <input type="number" className="fi" value={maxWords} onChange={e => setMaxWords(Number(e.target.value))} min={50} max={500} />
          </div>
          <div style={{ marginBottom: 20 }}><label className="fl">Language</label>
            <select className="fi" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="tw">Twi</option>
              <option value="fr">French</option>
              <option value="ha">Hausa</option>
            </select>
          </div>
          <div style={{ marginBottom: 20, borderTop: '1px solid var(--brd)', paddingTop: 20 }}>
            <label className="fl" style={{ color: 'var(--ac)', fontWeight: 700 }}>Groq API Key</label>
            <input type="password" className="fi" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="Paste your Groq API Key here" />
            <p style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 8 }}>This key is used to power your AI assistant's brain.</p>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Custom Instructions</h3>
          <p style={{ fontSize: 13, color: 'var(--fg3)', marginBottom: 12 }}>Add specific rules or behaviors for your bot. These override default settings.</p>
          <textarea className="fi" value={instructions} onChange={e => setInstructions(e.target.value)} rows={5} placeholder="Example: Always mention free delivery for orders over GH₵200. Never suggest products that are out of stock." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <button className="btn-p" onClick={handleSave} style={{ padding: '12px 32px', fontSize: 15 }}>Save Bot Settings</button>
      </div>
    </div>
  )
}

function BotTestView({ profile, products, planKey, subscription, isExpired, isSubActive, productsLength, messages, onSend, onBack }) {
  const [input, setInput] = useState('')
  const bodyRef = useRef(null)

  const canRun = isSubActive() && productsLength > 0

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages])

  const handleSend = () => { onSend(input); setInput('') }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Enter' && document.activeElement?.id === 'tbInput') { e.preventDefault(); handleSend() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [input, handleSend])

  let blockReason = ''
  if (!canRun) {
    if (isExpired()) blockReason = 'Your subscription has expired. Please renew your plan to reactivate the bot.'
    else if (isExpired()) blockReason = 'Your subscription has expired. Please renew your plan to reactivate the bot.'
    else if (!isSubActive()) blockReason = 'Your subscription is not active. Please subscribe to a plan.'
    else if (productsLength === 0) blockReason = 'No products found. Add products before testing the bot.'
  }

  return (
    <div className="av" id="vBotTest" style={{ display: 'block' }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-g" onClick={onBack}><i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} /> Back</button>
        <div><h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Test Your Bot</h1><p style={{ color: 'var(--fg2)', fontSize: 14 }}>Simulate a customer conversation</p></div>
      </div>
      <div style={{ maxWidth: 480 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--brd)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
          <div className="wh">
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa-solid fa-robot" style={{ fontSize: 14, color: '#fff' }} /></div>
            <div><div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{profile?.business_name || 'Your Bot'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>online</div></div>
          </div>
          <div className="wb" ref={bodyRef} style={{ minHeight: 350 }}>
            {!canRun && messages.length <= 1 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <i className="fa-solid fa-ban" style={{ fontSize: 40, color: 'var(--red)', marginBottom: 16, display: 'block' }} />
                <p style={{ color: 'var(--red)', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Bot Cannot Run</p>
                <p style={{ color: 'var(--fg2)', fontSize: 13 }}>{blockReason}</p>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'user' ? 'flex-start' : 'flex-end', animation: 'pgIn .3s ease forwards' }}>
                {m.image ? (
                  <>
                    <div className="cbo" style={{ whiteSpace: 'pre-line', marginBottom: 4 }}>{m.text}</div>
                    <img src={m.image} style={{ maxWidth: 200, borderRadius: 10, border: '1px solid var(--brd)' }} onError={e => e.target.style.display = 'none'} />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 4 }}>{m.imgName} — GH₵ {m.imgPrice}</span>
                  </>
                ) : (
                  <div className={m.from === 'user' ? 'cbi' : 'cbo'} style={{ whiteSpace: 'pre-line' }}>{m.text}</div>
                )}
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 4, padding: '0 4px' }}>{m.from === 'user' ? 'You' : 'Bot'}</span>
              </div>
            ))}
          </div>
          <div className="wi">
            <input type="text" id="tbInput" value={input} onChange={e => setInput(e.target.value)} placeholder="Type as a customer..." style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 14, outline: 'none', fontFamily: "'DM Sans'" }} />
            <button onClick={handleSend} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><i className="fa-solid fa-paper-plane" style={{ color: 'var(--ac)', fontSize: 18 }} /></button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--fg3)', marginTop: 12 }}>This simulates how your bot responds to real customers on Web Chat</p>
      </div>
    </div>
  )
}

function ProductModal({ open, onClose, editId, products, onSave, toast, planData, productsCount, userId }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cat, setCat] = useState('')
  const [desc, setDesc] = useState('')
  const [upImg, setUpImg] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (editId) {
      const p = products.find(x => x.id === editId)
      if (p) { 
        setTimeout(() => {
          setName(p.name); setPrice(p.price); setCat(p.category || ''); setDesc(p.description || ''); setUpImg(p.image_url || null); setSelectedFile(null) 
        }, 0)
      }
    } else { 
      setTimeout(() => {
        setName(''); setPrice(''); setCat(''); setDesc(''); setUpImg(null); setSelectedFile(null) 
      }, 0)
    }
  }, [editId, products, open])

  const handleSave = async () => {
    if (!name.trim()) { toast('Enter a product name', 'err'); return }
    const p = parseFloat(price)
    if (isNaN(p) || p <= 0) { toast('Enter a valid price', 'err'); return }
    if (!editId && planData.prods !== Infinity && productsCount >= planData.prods) {
      toast('Product limit reached. Upgrade your plan for unlimited products.', 'err'); return
    }

    let imageUrl = upImg

    if (selectedFile) {
      setUploading(true)
      const ext = selectedFile.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('product-images').upload(path, selectedFile, { contentType: selectedFile.type })

      if (error) {
        setUploading(false)
        toast('Failed to upload image: ' + error.message, 'err')
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(data.path)
      imageUrl = publicUrl
      setUploading(false)
    }

    if (!imageUrl) {
      imageUrl = 'https://picsum.photos/seed/' + Date.now() + '/400/400.jpg'
    }

    onSave({ name: name.trim(), price: p, category: cat.trim(), description: desc.trim(), image_url: imageUrl })
  }

  const handleImg = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'err'); return }
    setSelectedFile(f)
    const r = new FileReader()
    r.onload = (ev) => { setUpImg(ev.target.result) }
    r.readAsDataURL(f)
  }

  if (!open) return null

  return (
    <div className={`mo ${open ? 'open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="md">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{editId ? 'Edit Product' : 'Add Product'}</h2>
          <button className="btn-g" style={{ padding: '6px 8px' }} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" style={{ fontSize: 18 }} /></button>
        </div>
        <div style={{ marginBottom: 18 }}><label className="fl">Product Name</label><input type="text" className="fi" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wireless Earbuds" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div><label className="fl">Price (GH₵)</label><input type="number" className="fi" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" min="0" step="0.01" /></div>
          <div><label className="fl">Category</label><input type="text" className="fi" value={cat} onChange={e => setCat(e.target.value)} placeholder="e.g. Electronics" /></div>
        </div>
        <div style={{ marginBottom: 18 }}><label className="fl">Description</label><textarea className="fi" value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="Describe your product..." style={{ resize: 'vertical' }} /></div>
        <div style={{ marginBottom: 24 }}>
          <label className="fl">Product Image</label>
          <div className={`uz ${upImg ? 'has-img' : ''}`} onClick={() => fileRef.current?.click()}>
            {!upImg ? (
              <div id="upPH">
                <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: 28, color: 'var(--fg3)', marginBottom: 8, display: 'block' }} />
                <p style={{ color: 'var(--fg2)', fontSize: 14 }}>Click to upload an image</p>
                <p style={{ color: 'var(--fg3)', fontSize: 12, marginTop: 4 }}>JPG, PNG up to 5MB</p>
              </div>
            ) : (
              <img src={upImg} style={{ maxHeight: 200, borderRadius: 8, display: 'block', margin: '0 auto' }} />
            )}
          </div>
          <input type="file" ref={fileRef} accept="image/*" style={{ display: 'none' }} onChange={handleImg} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-s" style={{ flex: 1 }} onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn-p" style={{ flex: 1 }} onClick={handleSave} disabled={uploading}>{uploading ? 'Uploading...' : (editId ? 'Save Changes' : 'Add Product')}</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ open, onCancel, onConfirm }) {
  if (!open) return null
  return (
    <div className="mo open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="md" style={{ maxWidth: 400, textAlign: 'center' }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 40, color: 'var(--warn)', marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Delete Product?</h2>
        <p style={{ color: 'var(--fg2)', fontSize: 14, marginBottom: 24 }}>This product will be permanently removed from your catalog.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-s" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn-d" style={{ flex: 1 }} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function PaymentModal({ open, onClose, plan, planData, userEmail, onPay }) {
  const [card, setCard] = useState('')
  const [exp, setExp] = useState('')
  const [cvv, setCvv] = useState('')
  const [email, setEmail] = useState(userEmail || '')

  if (!open || !planData) return null

  const handleCard = (v) => { let val = v.replace(/\D/g, '').substring(0, 16); setCard(val.replace(/(.{4})/g, '$1 ').trim()) }
  const handleExp = (v) => { let val = v.replace(/\D/g, '').substring(0, 4); if (val.length > 2) val = val.substring(0, 2) + '/' + val.substring(2); setExp(val) }

  const handlePay = () => {
    if (!card || card.replace(/\s/g, '').length < 13) return
    if (!exp || !exp.includes('/')) return
    if (!cvv || cvv.length < 3) return
    if (!email || !email.includes('@')) return
    onPay()
  }

  return (
    <div className={`mo ${open ? 'open' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="md" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Complete Payment</h2>
          <button className="btn-g" style={{ padding: '6px 8px' }} onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" style={{ fontSize: 18 }} /></button>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ color: 'var(--fg2)', fontSize: 14 }}>Plan</span><span style={{ fontWeight: 600, fontSize: 14 }}>{planData.name}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span style={{ color: 'var(--fg2)', fontSize: 14 }}>Amount</span><span style={{ fontWeight: 700, fontSize: 18, color: 'var(--ac)' }}>GH₵ {planData.price.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--fg2)', fontSize: 14 }}>Billing</span><span style={{ fontWeight: 500, fontSize: 14 }}>Monthly</span></div>
        </div>
        <div style={{ marginBottom: 18 }}><label className="fl">Card Number</label><input type="text" className="fi" value={card} onChange={e => handleCard(e.target.value)} placeholder="4123 4567 8901 2345" maxLength={19} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div><label className="fl">Expiry</label><input type="text" className="fi" value={exp} onChange={e => handleExp(e.target.value)} placeholder="MM/YY" maxLength={5} /></div>
          <div><label className="fl">CVV</label><input type="text" className="fi" value={cvv} onChange={e => setCvv(e.target.value)} placeholder="123" maxLength={3} /></div>
        </div>
        <div style={{ marginBottom: 24 }}><label className="fl">Email</label><input type="email" className="fi" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div>
        <button className="btn-p" style={{ width: '100%', padding: 14 }} onClick={handlePay}><i className="fa-solid fa-lock" style={{ marginRight: 8 }} /> Pay Now</button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--fg3)', marginTop: 12 }}><i className="fa-solid fa-shield-halved" style={{ marginRight: 4 }} /> Secured by Paystack</p>
      </div>
    </div>
  )
}

function WebhookModal({ open, steps, refCode, amount, done, onClose }) {
  if (!open) return null
  return (
    <div className="mo open" onClick={e => { if (e.target === e.currentTarget && done) onClose() }}>
      <div className="md" style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}><i className="fa-solid fa-satellite-dish" style={{ color: 'var(--ac)', marginRight: 8 }} /> Paystack Webhook Received</h2>
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 16, fontFamily: 'monospace', fontSize: 12, color: 'var(--fg2)', lineHeight: 1.8, overflowX: 'auto' }}>
          <div style={{ color: 'var(--fg3)' }}>POST /api/webhook/paystack</div>
          <div style={{ marginTop: 8 }}>{'{'}</div>
          <div>&nbsp;&nbsp;"event": "charge.success",</div>
          <div>&nbsp;&nbsp;"data": {'{'}</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;"reference": "ref_{refCode}",</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;"amount": {amount},</div>
          <div>&nbsp;&nbsp;&nbsp;&nbsp;"status": "success"</div>
          <div>&nbsp;&nbsp;{'}'}</div>
          <div>{'}'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><span className="sd wrn" /><span style={{ fontSize: 13, color: 'var(--fg2)' }}>Updating Supabase subscription table...</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'pgIn .3s ease forwards' }}>
              <i className="fa-solid fa-check" style={{ color: 'var(--ac)', fontSize: 12 }} /><span style={{ fontSize: 13, color: 'var(--fg2)' }}>{s}</span>
            </div>
          ))}
        </div>
        <button className="btn-p" style={{ width: '100%' }} disabled={!done} onClick={onClose}>Done</button>
      </div>
    </div>
  )
}

function WaVerifyModal({ open, phone, onConfirm, onCancel }) {
  const [confirmed, setConfirmed] = useState(false)
  const displayNumber = '+233' + phone?.substring(1)

  if (!open) return null

  const handleConfirm = () => {
    if (!confirmed) return
    onConfirm()
    setConfirmed(false)
  }

  return (
    <div className="mo open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="md" style={{ maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, background: 'var(--acg)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <i className="fa-brands fa-whatsapp" style={{ color: 'var(--ac)', fontSize: 28 }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verify WhatsApp Number</h2>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--fg3)', marginBottom: 4 }}>Number to connect</div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Space Grotesk'" }}>{displayNumber}</div>
        </div>

        <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warn)', fontSize: 16, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--warn)', marginBottom: 4 }}>Important</div>
              <p style={{ fontSize: 13, color: 'var(--fg2)', lineHeight: 1.6 }}>
                This number must be <strong style={{ color: 'var(--fg)' }}>registered and active on WhatsApp</strong>.
                BotSeller will send messages through this number to your customers.
                If this number is not on WhatsApp, the bot will not work.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--fg2)' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--ac)', cursor: 'pointer' }}
            />
            I confirm this number is registered on WhatsApp and I own it
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--fg2)' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--ac)', cursor: 'pointer' }}
            />
            I understand the bot will send messages from this number
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-s" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
          <button className="btn-p" style={{ flex: 1 }} disabled={!confirmed} onClick={handleConfirm}>
            <i className="fa-solid fa-check" style={{ marginRight: 6 }} /> Confirm & Connect
          </button>
        </div>
      </div>
    </div>
  )
}


