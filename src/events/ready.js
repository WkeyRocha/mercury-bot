const { schedulePendingOrders } = require('../utils/orderExpiry');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Bot online como ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: 'Maked by rocha', type: 3 }],
      status: 'online',
    });

    try {
      const total = await schedulePendingOrders(client);
      console.log(`[Pedidos] ${total} pedido(s) pendente(s) agendado(s) para expiracao.`);
    } catch (err) {
      console.error('[Pedidos] Erro ao agendar expiracoes:', err.message);
    }
  },
};
