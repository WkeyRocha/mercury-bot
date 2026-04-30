-- Execute este SQL no editor SQL do Supabase para ativar:
-- carrinho duplicado, expiracao automatica, dashboard melhorado e avaliacoes.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'denied', 'expired'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_by VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rating_comment TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_expires_at ON orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_rating ON orders(rating);
