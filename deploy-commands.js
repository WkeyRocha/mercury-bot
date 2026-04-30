require('dotenv').config();
const { REST, Routes } = require('discord.js');

const dashboard = require('./src/commands/dashboard');
const setup = require('./src/commands/setup');
const comprar = require('./src/commands/comprar');
const produtos = require('./src/commands/produtos');
const relatorio = require('./src/commands/relatorio');

const commands = [dashboard.data, setup.data, comprar.data, produtos.data, relatorio.data].map(cmd => cmd.toJSON());

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (guildId) {
      console.log(`Registrando ${commands.length} comandos no servidor...`);
      await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId), { body: commands });
      console.log('Comandos registrados com sucesso!');
    } else {
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands });
      console.log('Comandos globais registrados!');
    }
  } catch (err) {
    console.error('Erro:', err);
  }
}

if (require.main === module) {
  deployCommands();
}

module.exports = { commands, deployCommands };
