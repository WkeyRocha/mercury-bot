const { EmbedBuilder } = require('discord.js');
const db = require('../database/supabase');
const { CORES } = require('./embeds');
const { enviarLog, msgPedidoExpirado } = require('./logs');

const timers = new Map();

function scheduleOrderExpiration(client, order) {
  if (!order || order.status !== 'pending') return;
  if (timers.has(order.id)) clearTimeout(timers.get(order.id));

  const expiresAt = order.expires_at ? new Date(order.expires_at).getTime() : Date.now();
  const delay = Math.max(expiresAt - Date.now(), 1_000);

  const timer = setTimeout(() => expireOrder(client, order.id).catch(console.error), delay);
  timers.set(order.id, timer);
}

async function schedulePendingOrders(client) {
  const orders = await db.getPendingOrders();
  orders.forEach(order => scheduleOrderExpiration(client, order));
  return orders.length;
}

async function expireOrder(client, orderId) {
  timers.delete(orderId);

  const current = await db.getOrderById(orderId).catch(() => null);
  if (!current || current.status !== 'pending') return null;

  const order = await db.expireOrder(orderId);

  if (order.channel_id) {
    const channel = await client.channels.fetch(order.channel_id).catch(() => null);
    if (channel) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(CORES.erro)
            .setTitle('Pedido expirado')
            .setDescription(`<@${order.user_id}> o tempo para pagamento deste pedido acabou. Este canal sera fechado em 30 segundos.`)
            .setTimestamp(),
        ],
      }).catch(console.error);
      setTimeout(() => channel.delete('Pedido expirado').catch(console.error), 30_000);
    }
  }

  await enviarLog(client, msgPedidoExpirado(order)).catch(console.error);
  return order;
}

module.exports = {
  scheduleOrderExpiration,
  schedulePendingOrders,
  expireOrder,
};
