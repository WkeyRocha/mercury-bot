const dashboard = require('../commands/dashboard');
const setup     = require('../commands/setup');
const comprar   = require('../commands/comprar');
const produtos  = require('../commands/produtos');
const pedidos   = require('../commands/pedidos');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');

const QRCode = require('qrcode');
const db     = require('../database/supabase');
const { gerarPayloadPix, gerarTxid, formatarValor } = require('../utils/pix');
const { embedPix, embedErro, embedSucesso, CORES }  = require('../utils/embeds');
const { enviarLog, msgCarrinhoCriado } = require('../utils/logs');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // ── Slash Commands ────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const handlers = {
        dashboard: dashboard.execute,
        setup:     setup.execute,
        produtos:  produtos.execute,
      };
      const handler = handlers[interaction.commandName];
      if (!handler) return;
      try {
        await handler(interaction);
      } catch (err) {
        console.error(`[/${interaction.commandName}]`, err);
        const msg = { content: '❌ Ocorreu um erro.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(console.error);
        else await interaction.reply(msg).catch(console.error);
      }
      return;
    }

    // ── Modais ────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id === 'modal_produto_novo' || id.startsWith('modal_produto_editar_')) {
        return produtos.handleModal(interaction);
      }
      return;
    }

    // ── Botões ────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;
      try {
        if (id.startsWith('pedido_confirmar_') || id.startsWith('pedido_negar_') ||
            id.startsWith('entrega_confirmar_') || id.startsWith('entrega_excluir_')) {
          return pedidos.handleButton(interaction);
        }
        if (id === 'dashboard_atualizar')                            return dashboard.handleButton(interaction);
        if (id === 'produto_novo' || id.startsWith('produto_editar_')) return produtos.handleButton(interaction);
        if (id.startsWith('fechar_canal_')) {
          const canal = interaction.channel;
          if (!canal) return;
          await interaction.reply({ content: '🗑️ Fechando canal em 5 segundos...', ephemeral: true });
          setTimeout(() => canal.delete().catch(console.error), 5000);
          return;
        }
        if (id.startsWith('confirmar_compra_')) {
          return handleConfirmarCompra(interaction, id.replace('confirmar_compra_', ''));
        }
        if (id === 'cancelar_compra') {
          await interaction.update({ content: '❌ Compra cancelada.', embeds: [], components: [] });
          return;
        }
      } catch (err) {
        console.error('[Button]', err);
      }
      return;
    }

    // ── Select Menus ──────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === 'produto_editar_sel' || id === 'produto_toggle_sel') return produtos.handleSelectMenu(interaction);
      if (id.startsWith('selecionar_produto_'))                        return handleSelecionarProduto(interaction);
    }
  },
};

// ── Usuário selecionou produto no menu ────────────────────
async function handleSelecionarProduto(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const produto = await db.getProductById(interaction.values[0]);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🛍️ ${produto.name}`)
      .setDescription(produto.description)
      .addFields({ name: '💰 Preço', value: `**${formatarValor(produto.price)}**`, inline: true })
      .setFooter({ text: 'Confirme para prosseguir com o pagamento via PIX' })
      .setTimestamp();

    if (produto.image_url) embed.setImage(produto.image_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`confirmar_compra_${produto.id}`).setLabel('✅ Confirmar Compra').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cancelar_compra').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}

// ── Usuário confirmou a compra ────────────────────────────
async function handleConfirmarCompra(interaction, produtoId) {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  try {
    const produto = await db.getProductById(produtoId);
    const txid    = gerarTxid(user.username);

    const payloadPix = gerarPayloadPix({
      chave: process.env.PIX_CHAVE, nome: process.env.PIX_NOME,
      cidade: process.env.PIX_CIDADE, valor: produto.price, txid,
      descricao: `${produto.name} - ${user.username}`,
    });

    const qrBuffer     = await QRCode.toBuffer(payloadPix, { type: 'png', width: 400, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
    const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode-pix.png' });

    const perms = [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages], deny: [PermissionFlagsBits.ManageChannels] },
    ];
    if (process.env.ADMIN_ROLE_ID) {
      perms.push({ id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] });
    }

    const chanOpts = {
      name: `compra-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      type: ChannelType.GuildText,
      topic: `Pedido de ${user.tag} — ${produto.name} — TXID: ${txid}`,
      permissionOverwrites: perms,
    };
    if (process.env.COMPRA_CATEGORY_ID) chanOpts.parent = process.env.COMPRA_CATEGORY_ID;

    const canal  = await guild.channels.create(chanOpts);
    const pedido = await db.createOrder({
      userId: user.id, username: user.tag, productId: produto.id,
      productName: produto.name, amount: produto.price, channelId: canal.id, pixTxid: txid,
    });

    // Log no canal de logs com botões de confirmar/negar
    await enviarLog(interaction.client, msgCarrinhoCriado(user, produto, txid, pedido.id));

    const embedPixMsg = embedPix(pedido, payloadPix);
    embedPixMsg.setImage('attachment://qrcode-pix.png');

    await canal.send({
      content: `<@${user.id}> Seu canal de compra foi criado! 🎉`,
      embeds: [embedPixMsg],
      files:  [qrAttachment],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fechar_canal_${canal.id}`).setLabel('🗑️ Fechar Canal').setStyle(ButtonStyle.Danger)
      )],
    });

    await interaction.editReply({
      embeds: [embedSucesso(
        `✅ Canal criado! Vá para ${canal} para pagar via PIX.\n\n` +
        `**📦 Produto:** ${produto.name}\n**💰 Valor:** ${formatarValor(produto.price)}\n**🆔 TXID:** \`${txid}\``
      )],
      components: [],
    });

  } catch (err) {
    console.error('[confirmar_compra]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}
