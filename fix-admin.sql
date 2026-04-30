-- ============================================
-- Minimal fix for Admin Dashboard
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Add is_admin column to profiles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Create business_info table (if not exists)
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

DROP POLICY IF EXISTS "Users can view own business info" ON business_info;
CREATE POLICY "Users can view own business info"
  ON business_info FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own business info" ON business_info;
CREATE POLICY "Users can insert own business info"
  ON business_info FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own business info" ON business_info;
CREATE POLICY "Users can update own business info"
  ON business_info FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can read business info" ON business_info;
CREATE POLICY "Service role can read business info"
  ON business_info FOR SELECT
  TO service_role
  USING (true);

-- 3. Create orders table (if not exists)
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

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = business_id);

DROP POLICY IF EXISTS "Service role can manage orders" ON orders;
CREATE POLICY "Service role can manage orders"
  ON orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Add admin policy for profiles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Admins can view all profiles') THEN
    CREATE POLICY "Admins can view all profiles"
      ON profiles FOR SELECT
      USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
  END IF;
END $$;

-- 5. Add updated_at trigger for business_info
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_business_info_updated_at ON business_info;
CREATE TRIGGER update_business_info_updated_at
  BEFORE UPDATE ON business_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Full Admin access to all tables (using non-recursive check)
DO $$
BEGIN
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Admins can manage all profiles') THEN
    CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL
    USING ( (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true );
  END IF;

  -- Subscriptions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Admins can manage all subscriptions') THEN
    CREATE POLICY "Admins can manage all subscriptions" ON subscriptions FOR ALL
    USING ( (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true );
  END IF;

  -- Payments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='Admins can manage all payments') THEN
    CREATE POLICY "Admins can manage all payments" ON payments FOR ALL
    USING ( (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true );
  END IF;

  -- Messages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='Admins can manage all messages') THEN
    CREATE POLICY "Admins can manage all messages" ON messages FOR ALL
    USING ( (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true );
  END IF;

  -- Products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Admins can manage all products') THEN
    CREATE POLICY "Admins can manage all products" ON products FOR ALL
    USING ( (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true );
  END IF;
END $$;

-- 7. SET YOURSELF AS ADMIN (replace with your email)
-- UPDATE profiles SET is_admin = true WHERE email = 'your-email@example.com';
