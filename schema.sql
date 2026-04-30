-- ===========================================
-- SCHEMA DO SUPABASE - Discord Shop Bot
-- Execute este SQL no editor do Supabase
-- ===========================================

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- Tabela de cupons
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixo')),
  discount_value NUMERIC(10, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pedidos
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  username VARCHAR(100) NOT NULL,
  product_id UUID REFERENCES products(id),
  product_name VARCHAR(100) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  original_amount NUMERIC(10, 2),
  discount_amount NUMERIC(10, 2) DEFAULT 0,
  coupon_code VARCHAR(32),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'denied', 'expired')),
  channel_id VARCHAR(50),
  pix_txid VARCHAR(50),
  confirmed_by VARCHAR(100),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivered_by VARCHAR(100),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  rating_comment TEXT,
  rated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);
CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_rating ON orders(rating);

-- Migração para bancos ja existentes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(32);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'confirmed', 'denied', 'expired'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_comment TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

-- Dados de exemplo para produtos (opcional — remova se quiser adicionar os seus)
INSERT INTO products (name, description, price, image_url) VALUES
  ('Produto Exemplo 1', 'Descrição detalhada do produto 1. Ótima qualidade!', 29.90, 'https://placehold.co/400x300/7289DA/FFFFFF?text=Produto+1'),
  ('Produto Exemplo 2', 'Descrição detalhada do produto 2. Super recomendado!', 49.90, 'https://placehold.co/400x300/43B581/FFFFFF?text=Produto+2'),
  ('Produto Exemplo 3', 'Descrição detalhada do produto 3. Melhor custo-benefício!', 19.90, 'https://placehold.co/400x300/FAA61A/FFFFFF?text=Produto+3'),
  ('Produto Exemplo 4', 'Descrição detalhada do produto 4. Edição limitada!', 99.90, 'https://placehold.co/400x300/F04747/FFFFFF?text=Produto+4'),
  ('Produto Exemplo 5', 'Descrição detalhada do produto 5. Novidade!', 59.90, 'https://placehold.co/400x300/B9BBBE/FFFFFF?text=Produto+5');
