import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { messageId } = await req.json();
    console.log("Processing message:", messageId);

    // 1. Fetch message and business info
    const { data: msg, error: msgErr } = await supabaseClient
      .from("messages")
      .select("*, profiles(*)")
      .eq("id", messageId)
      .single();

    if (msgErr || !msg) throw new Error("Message not found in database");
    if (msg.role !== "user")
      return new Response(JSON.stringify({ skipped: true }), {
        headers: corsHeaders,
      });

    const bizId = msg.business_id;
    const biz = msg.profiles;

    // 2. Fetch products, settings, and business info
    const [prodsRes, settingsRes, bizInfoRes] = await Promise.all([
      supabaseClient.from("products").select("*").eq("user_id", bizId),
      supabaseClient
        .from("bot_settings")
        .select("*")
        .eq("user_id", bizId)
        .maybeSingle(),
      supabaseClient
        .from("business_info")
        .select("*")
        .eq("user_id", bizId)
        .maybeSingle(),
    ]);

    const products = prodsRes.data || [];
    const settings = settingsRes.data || {};
    const bizInfo = bizInfoRes.data || {};
    const groqKey = settings.groq_api_key || Deno.env.get("GROQ_API_KEY");

    if (!groqKey)
      throw new Error("No Groq API Key found in secrets or settings");

    // 3. Build Prompt
    const productContext = products
      .map((p) => {
        let ctx = `${p.name}: GH₵ ${p.price} - ${p.description || ""}`;
        if (p.image_url) ctx += ` [Image: ${p.image_url}]`;
        return ctx;
      })
      .join("\n");

    // Fetch recent conversation history (last 10 messages)
    const { data: history } = await supabaseClient
      .from("messages")
      .select("role, content")
      .eq("conversation_id", msg.conversation_id)
      .neq("id", msg.id)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (history || []).reverse().map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

    const bizInfoContext = bizInfo ? `
      Business Information:
      ${bizInfo.address ? `Address: ${bizInfo.address}` : ''}
      ${bizInfo.location ? `Location: ${bizInfo.location}` : ''}
      ${bizInfo.delivery_hours ? `Delivery Hours: ${bizInfo.delivery_hours}` : ''}
      ${bizInfo.delivery_fee ? `Delivery Fee: ${bizInfo.delivery_fee}` : ''}
      ${bizInfo.payment_instructions ? `Payment Instructions: ${bizInfo.payment_instructions}` : ''}
      ${bizInfo.return_policy ? `Return Policy: ${bizInfo.return_policy}` : ''}
    ` : '';

    const systemPrompt = `
      You are a professional AI assistant for ${biz.business_name}.
      Industry: ${biz.industry || "Retail"}

      Products Available:
      ${productContext}

      ${bizInfoContext}

      IMPORTANT: You MUST use the above Business Information (address, location, delivery hours, etc.) when customers ask about these details. Do NOT use any default or placeholder information.

      Instructions:
      - Be helpful, polite, and conversational.
      - Use minimal emojis (only 1-2 per response max).
      - Do NOT repeat greetings. Only greet if this is clearly the first message.
      - When a customer asks about ANY product, you MUST reply with this EXACT format: "Here's the image: [Image: URL]" (no other text).
      - If the product has no image, reply with a brief description without any image tag.
      - If they want to buy, confirm the order details.
      ${biz.greeting ? `First message greeting: "${biz.greeting}"` : ""}
      ${settings.custom_instructions || ""}
    `;

    // 4. Call Groq
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
           model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: msg.content },
          ],
        }),
      },
    );

    const groqData = await groqRes.json();
    if (groqData.error)
      throw new Error(`Groq API Error: ${groqData.error.message}`);

    const aiReply =
      groqData.choices?.[0]?.message?.content ||
      "I'm sorry, I'm having trouble thinking right now.";

    // 5. Save AI reply
    await supabaseClient.from("messages").insert({
      business_id: bizId,
      customer_number: msg.customer_number,
      conversation_id: msg.conversation_id,
      role: "assistant",
      content: aiReply,
      metadata: JSON.stringify({ source: "ai_chat_vnext_stable" }),
    });

    return new Response(JSON.stringify({ success: true, reply: aiReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("AI Chat Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
