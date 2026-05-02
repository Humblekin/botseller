import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { messageId } = await req.json()
    
    // 1. Fetch message and business info
    const { data: msg, error: msgErr } = await supabaseClient
      .from('messages')
      .select('*, profiles(*)')
      .eq('id', messageId)
      .single()

    if (msgErr || !msg) throw new Error('Message not found')
    if (msg.role !== 'user') return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders })

    const bizId = msg.business_id
    const biz = msg.profiles

    // 2. Fetch products and settings
    const [prodsRes, settingsRes] = await Promise.all([
      supabaseClient.from('products').select('*').eq('user_id', bizId),
      supabaseClient.from('bot_settings').select('*').eq('user_id', bizId).maybeSingle()
    ])

    const products = prodsRes.data || []
    const settings = settingsRes.data || {}
    const groqKey = settings.groq_api_key || Deno.env.get('GROQ_API_KEY')

    if (!groqKey) throw new Error('No Groq API Key found')

    // 3. Build Prompt
    const productContext = products.map(p => `${p.name}: GH₵ ${p.price} - ${p.description}`).join('\n')
    const systemPrompt = `
      You are a helpful AI sales assistant for ${biz.business_name}.
      Greeting: ${biz.greeting || 'Hello!'}
      Tone: ${settings.tone || 'friendly'}
      Style: ${settings.style || 'concise'}
      Strategy: ${settings.sales_strategy || 'consultative'}
      Language: ${settings.language || 'en'}
      
      Products:
      ${productContext}
      
      Custom Instructions:
      ${settings.custom_instructions || ''}
      
      Rules:
      - Be polite and helpful.
      - If asked about price, use the prices provided above.
      - If a product isn't listed, politely say you don't carry it yet.
      - Keep responses under ${settings.max_response_words || 150} words.
    `

    // 4. Call Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: msg.content }
        ]
      })
    })

    const groqData = await groqRes.json()
    const aiReply = groqData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that right now."

    // 5. Save AI reply
    await supabaseClient.from('messages').insert({
      business_id: bizId,
      customer_number: msg.customer_number,
      conversation_id: msg.conversation_id,
      role: 'assistant',
      content: aiReply,
      metadata: JSON.stringify({ source: 'ai_chat_vnext' })
    })

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders, status: 200 })

  } catch (err) {
    console.error('AI Chat Error:', err)
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 })
  }
})
