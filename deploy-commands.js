require('dotenv').config();

const { REST, Routes } = require('discord.js');

const pedidos   = require('./src/commands/pedidos');
const dashboard = require('./src/commands/dashboard');
const setup     = require('./src/commands/setup');

const commands = [pedidos.data, dashboard.data, setup.data].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (guildId) {
      console.log(`🔄 Registrando ${commands.length} comandos...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
        { body: commands }
      );
      console.log('✅ Comandos registrados com sucesso!');
    }
  } catch (err) {
    console.error('❌ Erro:', err);
  }
})();