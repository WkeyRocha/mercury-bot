module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Bot online como ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: '🛒 /comprar • /pedidos • /dashboard', type: 3 }],
      status: 'online',
    });
  },
};
