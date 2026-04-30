module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Bot online como ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: 'Maked by rocha', type: 3 }],
      status: 'online',
    });
  },
};
