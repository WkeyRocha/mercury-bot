const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── PRODUTOS ──────────────────────────────────────────────
async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar produtos: ${error.message}`);
  return data;
}

async function getProductById(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Produto não encontrado: ${error.message}`);
  return data;
}

// ── PEDIDOS ───────────────────────────────────────────────
async function createOrder({ userId, username, productId, productName, amount, channelId, pixTxid }) {
  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      username,
      product_id: productId,
      product_name: productName,
      amount,
      channel_id: channelId,
      pix_txid: pixTxid,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar pedido: ${error.message}`);
  return data;
}

async function getOrders(status = null) {
  let query = supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar pedidos: ${error.message}`);
  return data;
}

async function getOrderById(id) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Pedido não encontrado: ${error.message}`);
  return data;
}

async function updateOrderStatus(id, status, confirmedBy = null) {
  const updateData = {
    status,
    confirmed_at: new Date().toISOString(),
  };
  if (confirmedBy) updateData.confirmed_by = confirmedBy;

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Erro ao atualizar pedido: ${error.message}`);
  return data;
}

async function getOrderByChannelId(channelId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('channel_id', channelId)
    .eq('status', 'pending')
    .single();

  if (error) return null;
  return data;
}

// ── DASHBOARD ─────────────────────────────────────────────
async function getDashboardStats() {
  const now = new Date();

  const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const { data: allOrders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar stats: ${error.message}`);

  const confirmed = allOrders.filter(o => o.status === 'confirmed');
  const pending   = allOrders.filter(o => o.status === 'pending');
  const denied    = allOrders.filter(o => o.status === 'denied');

  const filterByDate = (arr, since) =>
    arr.filter(o => new Date(o.created_at) >= since);

  const totalRevenue = confirmed.reduce((s, o) => s + Number(o.amount), 0);
  const revenueToday = filterByDate(confirmed, startOfDay).reduce((s, o) => s + Number(o.amount), 0);
  const revenueWeek  = filterByDate(confirmed, startOfWeek).reduce((s, o) => s + Number(o.amount), 0);
  const revenueMonth = filterByDate(confirmed, startOfMonth).reduce((s, o) => s + Number(o.amount), 0);

  // Top produtos
  const productMap = {};
  confirmed.forEach(o => {
    if (!productMap[o.product_name]) productMap[o.product_name] = { qty: 0, revenue: 0 };
    productMap[o.product_name].qty++;
    productMap[o.product_name].revenue += Number(o.amount);
  });

  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5);

  return {
    totals: {
      all: allOrders.length,
      confirmed: confirmed.length,
      pending: pending.length,
      denied: denied.length,
    },
    revenue: {
      total: totalRevenue,
      today: revenueToday,
      week: revenueWeek,
      month: revenueMonth,
    },
    counts: {
      today: filterByDate(allOrders, startOfDay).length,
      week:  filterByDate(allOrders, startOfWeek).length,
      month: filterByDate(allOrders, startOfMonth).length,
    },
    topProducts,
    recentOrders: allOrders.slice(0, 5),
  };
}

module.exports = {
  supabase,
  getProducts,
  getProductById,
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getOrderByChannelId,
  getDashboardStats,
};
