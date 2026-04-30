const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── PRODUTOS ──────────────────────────────────────────────
async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function getAllProducts() {
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function getProductById(id) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function createProduct({ nome, descricao, preco, imagem }) {
  const { data, error } = await supabase.from('products')
    .insert({ name: nome, description: descricao, price: preco, image_url: imagem, active: true })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateProduct(id, { nome, descricao, preco, imagem }) {
  const { data, error } = await supabase.from('products')
    .update({ name: nome, description: descricao, price: preco, image_url: imagem })
    .eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function toggleProduto(id, active) {
  const { error } = await supabase.from('products').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase();
}

async function getCoupons() {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function getCouponById(id) {
  const { data, error } = await supabase.from('coupons').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function getActiveCouponByCode(code) {
  const normalized = normalizeCouponCode(code);
  const { data, error } = await supabase.from('coupons').select('*').eq('code', normalized).eq('active', true).single();
  if (error) return null;
  return data;
}

async function createCoupon({ codigo, tipo, valor, active = true }) {
  const { data, error } = await supabase.from('coupons')
    .insert({ code: normalizeCouponCode(codigo), discount_type: tipo, discount_value: valor, active })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateCoupon(id, { codigo, tipo, valor, active = true }) {
  const { data, error } = await supabase.from('coupons')
    .update({ code: normalizeCouponCode(codigo), discount_type: tipo, discount_value: valor, active })
    .eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function toggleCoupon(id, active) {
  const { error } = await supabase.from('coupons').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── PEDIDOS ───────────────────────────────────────────────
function getOrderExpireMinutes() {
  const minutes = Number(process.env.ORDER_EXPIRE_MINUTES || 30);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
}

async function createOrder({ userId, username, productId, productName, amount, channelId, pixTxid, couponCode = null, originalAmount = null, discountAmount = 0 }) {
  const expiresAt = new Date(Date.now() + getOrderExpireMinutes() * 60_000).toISOString();
  const { data, error } = await supabase.from('orders')
    .insert({
      user_id: userId,
      username,
      product_id: productId,
      product_name: productName,
      amount,
      original_amount: originalAmount || amount,
      discount_amount: discountAmount,
      coupon_code: couponCode,
      channel_id: channelId,
      pix_txid: pixTxid,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function getOrders(status = null) {
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function getOpenOrderByUser(userId) {
  const { data, error } = await supabase.from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data[0] || null;
}

async function getPendingOrders() {
  const { data, error } = await supabase.from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function getOrderById(id) {
  const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateOrderStatus(id, status, confirmedBy = null) {
  const { data, error } = await supabase.from('orders')
    .update({ status, confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function expireOrder(id) {
  const { data, error } = await supabase.from('orders')
    .update({ status: 'expired', confirmed_by: 'Sistema', confirmed_at: new Date().toISOString(), expired_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function updateDeliveryChannel(id, deliveryChannelId, deliveryNumber) {
  const { error } = await supabase.from('orders')
    .update({ delivery_channel_id: deliveryChannelId, delivery_number: deliveryNumber })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

async function markOrderDelivered(id, deliveredBy) {
  const { error } = await supabase.from('orders')
    .update({ delivered_by: deliveredBy, delivered_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

async function rateOrder(id, rating, comment = null) {
  const { data, error } = await supabase.from('orders')
    .update({ rating, rating_comment: comment, rated_at: new Date().toISOString() })
    .eq('id', id)
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function getNextDeliveryNumber() {
  const { data, error } = await supabase.from('orders')
    .select('delivery_number').not('delivery_number', 'is', null)
    .order('delivery_number', { ascending: false }).limit(1);
  if (error || !data.length) return 1;
  return (data[0].delivery_number || 0) + 1;
}

// ── DASHBOARD ─────────────────────────────────────────────
async function getDashboardStats() {
  const now          = new Date();
  const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const { data: allOrders, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const confirmed = allOrders.filter(o => o.status === 'confirmed');
  const pending   = allOrders.filter(o => o.status === 'pending');
  const denied    = allOrders.filter(o => o.status === 'denied');
  const expired   = allOrders.filter(o => o.status === 'expired');

  const filterByDate  = (arr, since) => arr.filter(o => new Date(o.created_at) >= since);
  const sumAmount     = arr => arr.reduce((s, o) => s + Number(o.amount || 0), 0);
  const sumDiscount   = arr => arr.reduce((s, o) => s + Number(o.discount_amount || 0), 0);

  const productMap = {};
  const couponMap = {};
  confirmed.forEach(o => {
    if (!productMap[o.product_name]) productMap[o.product_name] = { qty: 0, revenue: 0 };
    productMap[o.product_name].qty++;
    productMap[o.product_name].revenue += Number(o.amount);

    if (o.coupon_code) {
      if (!couponMap[o.coupon_code]) couponMap[o.coupon_code] = { qty: 0, discount: 0 };
      couponMap[o.coupon_code].qty++;
      couponMap[o.coupon_code].discount += Number(o.discount_amount || 0);
    }
  });

  const rated = allOrders.filter(o => o.rating);
  const avgRating = rated.length ? rated.reduce((s, o) => s + Number(o.rating), 0) / rated.length : 0;

  return {
    totals:  { all: allOrders.length, confirmed: confirmed.length, pending: pending.length, denied: denied.length, expired: expired.length },
    revenue: { total: sumAmount(confirmed), today: sumAmount(filterByDate(confirmed, startOfDay)), week: sumAmount(filterByDate(confirmed, startOfWeek)), month: sumAmount(filterByDate(confirmed, startOfMonth)), pending: sumAmount(pending) },
    discounts: { total: sumDiscount(confirmed), today: sumDiscount(filterByDate(confirmed, startOfDay)), week: sumDiscount(filterByDate(confirmed, startOfWeek)), month: sumDiscount(filterByDate(confirmed, startOfMonth)) },
    counts:  { today: filterByDate(allOrders, startOfDay).length, week: filterByDate(allOrders, startOfWeek).length, month: filterByDate(allOrders, startOfMonth).length },
    topProducts: Object.entries(productMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5),
    topCoupons: Object.entries(couponMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5),
    ratings: { total: rated.length, average: avgRating },
    recentOrders: allOrders.slice(0, 5),
  };
}

module.exports = {
  supabase, getProducts, getAllProducts, getProductById, createProduct, updateProduct, toggleProduto,
  normalizeCouponCode, getCoupons, getCouponById, getActiveCouponByCode, createCoupon, updateCoupon, toggleCoupon,
  createOrder, getOrders, getOpenOrderByUser, getPendingOrders, getOrderById, updateOrderStatus, expireOrder, updateDeliveryChannel, markOrderDelivered, rateOrder, getNextDeliveryNumber,
  getDashboardStats,
};
