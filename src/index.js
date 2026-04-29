require('dotenv').config();

const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ── Validação de variáveis de ambiente ───────────────────
const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PIX_CHAVE', 'PIX_NOME', 'PIX_CIDADE'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Variáveis de ambiente faltando: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Cliente Discord ───────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

// ── Carrega eventos ───────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// ── Tratamento de erros global ────────────────────────────
process.on('unhandledRejection', err => {
  console.error('[UnhandledRejection]', err);
});

process.on('uncaughtException', err => {
  console.error('[UncaughtException]', err);
});

client.on('error', err => console.error('[Discord Error]', err));
client.on('warn', msg => console.warn('[Discord Warn]', msg));

// ── Login ─────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Falha ao fazer login:', err.message);
  process.exit(1);
});
