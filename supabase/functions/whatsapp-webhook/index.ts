// supabase/functions/whatsapp-webhook/index.ts
// WhatsApp Business API Webhook + Groq AI Edge Function

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle Meta webhook verification (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || 'botseller_verify'
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // Handle incoming messages (POST)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Initialize Supabase client inside handler (avoids module-load crashes)
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const supabase = createClient(
    Deno.env.get('SUPA_URL')!,
    Deno.env.get('SUPA_KEY')!
  )

  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
  const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')

  let body
  try { body = await req.json() } catch { return new Response('Bad request', { status: 400 }) }

  const entry = body.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const messages = value?.messages

  if (!value || !messages || messages.length === 0) {
    return new Response(JSON.stringify({ success: false }), { status: 200 })
  }

  const message = messages[0]
  if (!message) {
    return new Response(JSON.stringify({ success: false }), { status: 200 })
  }

  const from = message.from
  const waId = value.metadata?.display_phone_number
  const startTime = Date.now()
  const text = message.text?.body?.trim()
  
  // Use system defaults unless business-specific ones are found
  let bizToken = WHATSAPP_TOKEN
  let bizPhoneId = WHATSAPP_PHONE_ID

  if (message.type !== 'text') {
    await sendWhatsApp(from, 'Sorry, I only support text messages at the moment.', bizToken, bizPhoneId)
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  }

  if (!text) return new Response(JSON.stringify({ success: true }), { status: 200 })

  let businessId: string | null = null

  try {
    // 1. Find the business that owns this WhatsApp number
    // We normalize the incoming waId (remove + if present)
    const normalizedWaId = waId?.replace(/\+/g, '') || ''
    const phoneId = value.metadata?.phone_number_id

    // Try finding by number or by phone_id
    let { data: waConn } = await supabase
      .from('whatsapp_connections')
      .select('user_id, status, phone_id, access_token, phone_number')
      .or(`phone_number.eq.+${normalizedWaId},phone_id.eq.${phoneId}`)
      .eq('status', 'connected')
      .maybeSingle()

    if (!waConn) {
      console.log('No connected business for phone:', waId, 'or ID:', phoneId)
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    businessId = waConn.user_id
    bizToken = waConn.access_token || WHATSAPP_TOKEN
    bizPhoneId = waConn.phone_id || WHATSAPP_PHONE_ID

    // 2. ATOMIC check + reserve message slot
    const { data: canSend } = await supabase.rpc('use_message', { biz_id: businessId })
    if (!canSend) {
      await sendWhatsApp(from, 'Sorry, you have reached your monthly message limit or your subscription has expired. Please upgrade your plan to continue.', bizToken, bizPhoneId)
      await logApiCall(supabase, businessId, startTime, 200, null, null, { customer: from, reason: 'limit_reached' })
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

    // 3. Get business profile, bot settings, business info, and products
    const [profileRes, settingsRes, infoRes, productsRes] = await Promise.all([
      supabase.from('profiles').select('business_name, greeting').eq('id', businessId).single(),
      supabase.from('bot_settings').select('tone, style, sales_strategy, max_response_words, language, custom_instructions').eq('user_id', businessId).single(),
      supabase.from('business_info').select('*').eq('user_id', businessId).single(),
      supabase.from('products').select('name, description, price, image_url, category, stock').eq('user_id', businessId).eq('active', true).limit(20)
    ])

    const profile = profileRes.data
    const settings = settingsRes.data
    const businessInfo = infoRes.data
    const products = productsRes.data || []

    const productContext = products.length > 0
      ? 'Products available:\n' + products.map(p => `- ${p.name}: ${p.description} (GH₵ ${p.price})${p.stock !== null ? `, Stock: ${p.stock}` : ''}`).join('\n')
      : 'No products listed yet.'

    const businessContext = businessInfo
      ? `Business Information:\n- Address: ${businessInfo.address || 'Not set'}\n- Location: ${businessInfo.location || 'Not set'}\n- Delivery Hours: ${businessInfo.delivery_hours || 'Not set'}\n- Delivery Fee: ${businessInfo.delivery_fee || 'Not set'}\n- Return Policy: ${businessInfo.return_policy || 'Not set'}\n- Payment Instructions: ${businessInfo.payment_instructions || 'Pay via Mobile Money or Cash on Delivery'}`
      : 'No business details set.'

    // 4. Resolve conversation_id
    let conversationId: string
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('business_id', businessId)
      .eq('customer_number', '+' + from)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    conversationId = lastMsg?.conversation_id || crypto.randomUUID()

    // 5. Get recent conversation history
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('business_id', businessId)
      .eq('customer_number', '+' + from)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = history
      ? history.reverse().map(m => ({ role: m.role, content: m.content }))
      : []

    // 6. Build AI system prompt
    const tone = settings?.tone || 'friendly'
    const style = settings?.style || 'concise'
    const strategy = settings?.sales_strategy || 'consultative'
    const maxWords = settings?.max_response_words || 150

    const systemPrompt = `You are a sales assistant for "${profile?.business_name || 'this business'}".

Tone: ${tone}
Style: ${style}
Sales strategy: ${strategy}
Greeting: "${profile?.greeting || 'Hello! How can I help you?'}"
Maximum response length: ${maxWords} words

${productContext}

${businessContext}

Rules:
- Be concise and helpful. Focus on selling and answering product questions.
- If the user asks to see products or asks for a menu, list ALL available products clearly with their names and prices.
- If asked about a specific product, mention its name, price, and key features. NEVER say "I cannot display images" — just describe the product naturally.
- If the user asks about location, address, hours, delivery fees, or return policy, answer using the Business Information provided above. NEVER say "I don't have that information" if it is provided.
- Only use the greeting on the first message of a conversation or when the user says hello. Do not repeat it for follow-up questions.
- All prices are in Ghana Cedis (GH₵). NEVER use dollar symbols ($).
- If unsure, politely ask for clarification.
- Never mention you are an AI unless directly asked.
- Keep responses under ${maxWords} words.
- Use the customer's language.
- IMPORTANT: If the user asks to see images, photos, or pictures of products, add the tag [SEND_ALL_IMAGES] at the very end of your response.
- IMPORTANT: If you are talking about a specific product that has an image, add the tag [SEND_IMAGE: Product Name] at the very end of your response.
- IMPORTANT: When the user wants to buy/order, ask for their name, delivery address, and preferred payment method. Once they confirm, create an order summary and add the tag [CREATE_ORDER: name=..., address=..., items=..., total=...] at the very end.
- IMPORTANT: After creating an order, provide payment instructions using [SHOW_PAYMENT_INFO] at the very end of your response.
${settings?.custom_instructions ? '\nAdditional instructions:\n' + settings.custom_instructions : ''}`

    // 7. Call Groq API
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-8),
      { role: 'user', content: text }
    ]

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 300,
      }),
    })

    const groqData = await groqRes.json()
    const reply = groqData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that. Please try again."
    const usage = groqData.usage

    // 8. Save messages
    const { error: msgError } = await supabase.from('messages').insert([
      { business_id: businessId, customer_number: '+' + from, conversation_id: conversationId, role: 'user', content: text, metadata: JSON.stringify({ source: 'whatsapp' }) },
      { business_id: businessId, customer_number: '+' + from, conversation_id: conversationId, role: 'assistant', content: reply, metadata: JSON.stringify({ source: 'whatsapp', model: 'llama-3.3-70b-versatile' }) }
    ])

    if (msgError) console.error('Failed to save messages:', msgError)

    // 9. Log API call
    await logApiCall(supabase, businessId, startTime, 200, 'llama-3.3-70b-versatile', usage, { customer: from, conversation_id: conversationId })

    // 10. Parse AI instructions for image sending
    let cleanReply = reply
    
    // Check for [SEND_ALL_IMAGES] tag
    if (cleanReply.includes('[SEND_ALL_IMAGES]')) {
      cleanReply = cleanReply.replace('[SEND_ALL_IMAGES]', '').trim()
      console.log('AI requested all images')
      for (const p of products) {
        if (p.image_url) {
          console.log('Sending image:', p.name)
          await sendWhatsAppImage(from, p.image_url, bizToken, bizPhoneId)
        }
      }
    }
    
    // Check for [SEND_IMAGE: Name] tags
    const imageMatches = cleanReply.match(/\[SEND_IMAGE:\s*(.*?)\]/g)
    if (imageMatches) {
      for (const match of imageMatches) {
        cleanReply = cleanReply.replace(match, '').trim()
        const name = match.replace(/\[SEND_IMAGE:\s*/, '').replace(']', '').trim()
        const product = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()))
        if (product && product.image_url) {
          console.log('AI requested image for:', name)
          await sendWhatsAppImage(from, product.image_url, bizToken, bizPhoneId)
        }
      }
    }

    // Check for [CREATE_ORDER: name=..., address=..., items=..., total=...] tag
    const orderMatch = cleanReply.match(/\[CREATE_ORDER:\s*(.*?)\]/)
    if (orderMatch) {
      cleanReply = cleanReply.replace(orderMatch[0], '').trim()
      const orderStr = orderMatch[1].trim()
      const orderData: Record<string, string> = { business_id: businessId, customer_phone: '+' + from, status: 'pending' }
      for (const part of orderStr.split(',')) {
        const eq = part.indexOf('=')
        if (eq > 0) orderData[part.substring(0, eq).trim()] = part.substring(eq + 1).trim()
      }
      const { error } = await supabase.from('orders').insert(orderData)
      if (error) console.error('Failed to create order:', error)
      else console.log('Order created:', orderData)
    }

    // Check for [SHOW_PAYMENT_INFO] tag
    if (cleanReply.includes('[SHOW_PAYMENT_INFO]')) {
      cleanReply = cleanReply.replace('[SHOW_PAYMENT_INFO]', '').trim()
      const payInfo = businessInfo?.payment_instructions || 'Please send payment via MTN MoMo to 0241234567 or Cash on Delivery.'
      await sendWhatsApp(from, '💳 Payment Instructions:\n' + payInfo, bizToken, bizPhoneId)
    }

    // Send the clean text reply to user
    await sendWhatsApp(from, cleanReply, bizToken, bizPhoneId)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('WhatsApp webhook error:', err)
    await logApiCall(supabase, businessId, startTime, 500, null, null, { error: err.message })
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function sendWhatsApp(to: string, text: string, token: string | undefined, phoneId: string | undefined) {
  if (!token || !phoneId) {
    console.error('Missing WhatsApp token or phone ID')
    return
  }
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    console.error('Failed to send WhatsApp message:', await res.text())
  }
  return res
}

async function sendWhatsAppImage(to: string, imageUrl: string, token: string | undefined, phoneId: string | undefined) {
  if (!token || !phoneId) return
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: imageUrl },
    }),
  })

  if (!res.ok) {
    console.error('Failed to send WhatsApp image:', await res.text())
  }
  return res
}

async function logApiCall(supabase: any, bizId: string | null, startTime: number, status: number, model: string | null, usage: any, meta: any) {
  try {
    await supabase.from('api_logs').insert({
      business_id: bizId,
      endpoint: '/whatsapp-webhook',
      method: 'POST',
      model,
      input_tokens: usage?.prompt_tokens || null,
      output_tokens: usage?.completion_tokens || null,
      status,
      duration_ms: Date.now() - startTime,
      metadata: JSON.stringify(meta || {})
    })
  } catch (e) {
    console.error('Failed to log API call:', e)
  }
}
