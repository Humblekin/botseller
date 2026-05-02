-- ============================================
-- BotSeller Supabase Schema (v4 — Production Hardened)
-- Run this in your Supabase SQL Editor
-- Fixes: atomic message limits, product limits, conversation grouping, bot_settings, log retention
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 0. PLANS TABLE (source of truth for limits)
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message_limit INTEGER,
  product_limit INTEGER,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO plans (id, name, message_limit, product_limit, price) VALUES
('starter', 'Free Trial', 50, 10, 0),
('business', 'Business', 2000, NULL, 99),
('enterprise', 'Enterprise', NULL, NULL, 249)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plans"
  ON plans FOR SELECT
  USING (true);

-- ============================================
-- 1. PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  business_name TEXT NOT NULL,
  greeting TEXT DEFAULT 'Hello! Welcome! How can I help you today?',
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));

-- ============================================
-- 2. BOT SETTINGS TABLE (AI prompt control layer)
-- ============================================
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  tone TEXT DEFAULT 'friendly',
  style TEXT DEFAULT 'concise',
  sales_strategy TEXT DEFAULT 'consultative',
  max_response_words INTEGER DEFAULT 150,
  language TEXT DEFAULT 'en',
  custom_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_bot_settings UNIQUE (user_id)
);

ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bot settings"
  ON bot_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bot settings"
  ON bot_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bot settings"
  ON bot_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can read bot settings"
  ON bot_settings FOR SELECT
  TO service_role
  USING (true);

-- ============================================
-- 2.5 BUSINESS INFO TABLE (for AI context)
-- ============================================
CREATE TABLE IF NOT EXISTS business_info (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  address TEXT,
  location TEXT,
  delivery_hours TEXT,
  delivery_fee TEXT,
  payment_instructions TEXT,
  return_policy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_business_info UNIQUE (user_id)
);

ALTER TABLE business_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business info"
  ON business_info FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own business info"
  ON business_info FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own business info"
  ON business_info FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can read business info"
  ON business_info FOR SELECT
  TO service_role
  USING (true);

-- ============================================
-- 3. ORDERS TABLE (customer orders via Web Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC(10, 2),
  status TEXT DEFAULT 'pending',
  delivery_address TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = business_id);

CREATE POLICY "Service role can manage orders"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 3. PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  category TEXT,
  description TEXT,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  stock INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can view products"
  ON products FOR SELECT
  TO service_role
  USING (true);

-- ============================================
-- 4. SUBSCRIPTIONS TABLE (ONE per user)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'active',
  expiry_date TIMESTAMPTZ,
  paystack_reference TEXT UNIQUE,
  amount_paid NUMERIC(10, 2),
  messages_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can read subscriptions"
  ON subscriptions FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert subscriptions"
  ON subscriptions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update subscriptions"
  ON subscriptions FOR UPDATE
  TO service_role
  USING (true);

-- ============================================
-- 5. MESSAGES TABLE (AI-ready, role-based, conversation-aware)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  customer_number TEXT NOT NULL,
  conversation_id UUID,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  USING (auth.uid() = business_id);

CREATE POLICY "Users can insert messages as user only"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = business_id AND role = 'user');

CREATE POLICY "Service role can insert messages"
  ON messages FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can view messages"
  ON messages FOR SELECT
  TO service_role
  USING (true);

-- ============================================
-- TRIGGER: Auto-resolve conversation_id on insert
-- If NULL, reuses the most recent conversation for this customer, or creates a new one
-- ============================================
CREATE OR REPLACE FUNCTION auto_resolve_conversation_id()
RETURNS TRIGGER AS $$
DECLARE
  last_conv UUID;
BEGIN
  IF NEW.conversation_id IS NULL THEN
    SELECT conversation_id INTO last_conv
    FROM messages
    WHERE business_id = NEW.business_id
      AND customer_number = NEW.customer_number
      AND conversation_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF last_conv IS NOT NULL THEN
      NEW.conversation_id := last_conv;
    ELSE
      NEW.conversation_id := uuid_generate_v4();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS before_message_insert ON messages;

CREATE TRIGGER before_message_insert
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_conversation_id();

-- ============================================
-- 6. WHATSAPP CONNECTIONS TABLE (provider-agnostic, ONE per user)
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  status TEXT DEFAULT 'connected',
  provider TEXT DEFAULT 'whatsapp',
  webhook_url TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_whatsapp UNIQUE (user_id)
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own WhatsApp connection"
  ON whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own WhatsApp connection"
  ON whatsapp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own WhatsApp connection"
  ON whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own WhatsApp connection"
  ON whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 7. PAYMENTS TABLE (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'pending',
  plan TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payments"
  ON payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 8. API LOGS TABLE (debugging + rate limiting)
-- ============================================
CREATE TABLE IF NOT EXISTS api_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  endpoint TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  status INTEGER,
  error TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api logs"
  ON api_logs FOR SELECT
  USING (auth.uid() = business_id);

CREATE POLICY "Service role can manage api logs"
  ON api_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- TRIGGER: Auto-create profile + subscription on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, business_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1) || '''s Store');
  INSERT INTO public.subscriptions (user_id, plan, status, expiry_date)
  VALUES (NEW.id, 'starter', 'active', NOW() + INTERVAL '7 days');
  INSERT INTO public.bot_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TRIGGER: Auto-update updated_at on subscriptions
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_settings_updated_at
  BEFORE UPDATE ON bot_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_info_updated_at
  BEFORE UPDATE ON business_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TRIGGER: Enforce product limit on insert
-- ============================================
CREATE OR REPLACE FUNCTION enforce_product_limit()
RETURNS TRIGGER AS $$
DECLARE
  sub RECORD;
  plan_rec RECORD;
  count_products INTEGER;
BEGIN
  SELECT * INTO sub FROM subscriptions WHERE user_id = NEW.user_id;
  IF sub IS NULL THEN
    RAISE EXCEPTION 'No subscription found for user';
  END IF;

  SELECT * INTO plan_rec FROM plans WHERE id = sub.plan;
  IF plan_rec IS NULL THEN
    RAISE EXCEPTION 'Invalid plan: %', sub.plan;
  END IF;

  IF plan_rec.product_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO count_products FROM products WHERE user_id = NEW.user_id;
    IF count_products >= plan_rec.product_limit THEN
      RAISE EXCEPTION 'Product limit reached for plan % (%)', plan_rec.name, plan_rec.product_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS before_product_insert ON products;

CREATE TRIGGER before_product_insert
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_limit();

-- ============================================
-- 9. STORAGE BUCKET for product images
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images' AND auth.uid() = owner);

CREATE POLICY "Users can delete their product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND auth.uid() = owner);

CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_customer_number ON messages(customer_number);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_history
  ON messages(business_id, customer_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_id ON whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_api_logs_business_id ON api_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);

-- ============================================
-- ATOMIC HELPER: use_message() — check limit AND increment in one locked transaction
-- Replaces can_send_message() + increment_message_usage()
-- ============================================
CREATE OR REPLACE FUNCTION use_message(biz_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sub RECORD;
  plan_rec RECORD;
BEGIN
  SELECT * INTO sub FROM subscriptions WHERE user_id = biz_id FOR UPDATE;
  IF sub IS NULL THEN RETURN FALSE; END IF;

  SELECT * INTO plan_rec FROM plans WHERE id = sub.plan;
  IF plan_rec IS NULL THEN RETURN FALSE; END IF;

  IF sub.status != 'active' OR sub.expiry_date < NOW() THEN
    RETURN FALSE;
  END IF;

  IF plan_rec.message_limit IS NOT NULL AND sub.messages_used >= plan_rec.message_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE subscriptions
  SET messages_used = messages_used + 1
  WHERE user_id = biz_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER: Check if business can add a product (plan guard)
-- ============================================
CREATE OR REPLACE FUNCTION can_add_product(biz_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sub RECORD;
  plan_rec RECORD;
  count_products INTEGER;
BEGIN
  SELECT * INTO sub FROM subscriptions WHERE user_id = biz_id;
  IF sub IS NULL THEN RETURN FALSE; END IF;

  SELECT * INTO plan_rec FROM plans WHERE id = sub.plan;
  IF plan_rec IS NULL THEN RETURN FALSE; END IF;

  IF plan_rec.product_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO count_products FROM products WHERE user_id = biz_id;

  RETURN count_products < plan_rec.product_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER: Auto-expire subscriptions past their expiry date
-- Run manually or via Supabase scheduled function (cron)
-- ============================================
CREATE OR REPLACE FUNCTION expire_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE subscriptions
  SET status = 'expired'
  WHERE expiry_date < NOW() AND status = 'active';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER: Clean up old API logs (retention strategy)
-- Run manually or via Supabase cron: daily
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_api_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM api_logs WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
