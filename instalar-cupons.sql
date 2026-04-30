-- Execute este SQL no editor SQL do Supabase para ativar cupons.

CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixo')),
  discount_value NUMERIC(10, 2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_amount NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_comment TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

-- Status extra usado pela expiracao automatica.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'denied', 'expired'));

CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_rating ON orders(rating);
