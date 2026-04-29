const pedidos   = require('../commands/pedidos');
const dashboard = require('../commands/dashboard');
const setup     = require('../commands/setup');
const comprar   = require('../commands/comprar');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    if (interaction.isChatInputCommand()) {
      const handlers = {
        pedidos:   pedidos.execute,
        dashboard: dashboard.execute,
        setup:     setup.execute,
      };

      const handler = handlers[interaction.commandName];
      if (!handler) return;

      try {
        await handler(interaction);
      } catch (err) {
        console.error(`[Comando /${interaction.commandName}]`, err);
        const errorMsg = { content: '❌ Ocorreu um erro.', ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(errorMsg).catch(console.error);
        } else {
          await interaction.reply(errorMsg).catch(console.error);
        }
      }
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      try {
        if (
          id.startsWith('cat_anterior_') ||
          id.startsWith('cat_proximo_') ||
          id.startsWith('comprar_') ||
          id.startsWith('fechar_canal_') ||
          id === 'abrir_catalogo'
        ) {
          return comprar.handleButton(interaction);
        }

        if (id.startsWith('pedido_')) {
          return pedidos.handleButton(interaction);
        }

        if (id === 'dashboard_atualizar') {
          return dashboard.handleButton(interaction);
        }

      } catch (err) {
        console.error('[Button]', err);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'pedidos_filtro') {
        return pedidos.handleSelectMenu(interaction);
      }
    }
  },
};