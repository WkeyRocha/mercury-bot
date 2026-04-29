const pedidos   = require('../commands/pedidos');
const dashboard = require('../commands/dashboard');
const setup     = require('../commands/setup');
const comprar   = require('../commands/comprar');

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

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {

    // ── Slash Commands ────────────────────────────────────
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
        const msg = { content: '❌ Ocorreu um erro.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(console.error);
        else await interaction.reply(msg).catch(console.error);
      }
      return;
    }

    // ── Botões ────────────────────────────────────────────
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

        if (id.startsWith('pedido_'))        return pedidos.handleButton(interaction);
        if (id === 'dashboard_atualizar')    return dashboard.handleButton(interaction);

        // Botão confirmar compra no canal privado
        if (id.startsWith('confirmar_compra_')) {
          const produtoId = id.replace('confirmar_compra_', '');
          return handleConfirmarCompra(interaction, produtoId);
        }

      } catch (err) {
        console.error('[Button]', err);
      }
      return;
    }

    // ── Select Menus ──────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id === 'pedidos_filtro') return pedidos.handleSelectMenu(interaction);

      // Menu de seleção de produto da loja
      if (id.startsWith('selecionar_produto_')) {
        return handleSelecionarProduto(interaction);
      }
    }
  },
};

// ── Usuário selecionou um produto no menu ─────────────────
async function handleSelecionarProduto(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const produtoId = interaction.values[0];

  try {
    const produto = await db.getProductById(produtoId);

    // Mostra detalhes + botão de confirmar
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🛍️ ${produto.name}`)
      .setDescription(produto.description)
      .addFields(
        { name: '💰 Preço', value: `**${formatarValor(produto.price)}**`, inline: true },
      )
      .setFooter({ text: 'Clique em Confirmar Compra para prosseguir com o pagamento PIX' })
      .setTimestamp();

    if (produto.image_url) embed.setImage(produto.image_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirmar_compra_${produto.id}`)
        .setLabel('✅ Confirmar Compra')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancelar_compra')
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });

  } catch (err) {
    console.error('[selecionar_produto]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro ao carregar produto: ${err.message}`)] });
  }
}

// ── Usuário confirmou a compra ────────────────────────────
async function handleConfirmarCompra(interaction, produtoId) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user  = interaction.user;

  try {
    const produto = await db.getProductById(produtoId);
    const txid    = gerarTxid(user.username);

    const payloadPix = gerarPayloadPix({
      chave:     process.env.PIX_CHAVE,
      nome:      process.env.PIX_NOME,
      cidade:    process.env.PIX_CIDADE,
      valor:     produto.price,
      txid,
      descricao: `${produto.name} - ${user.username}`,
    });

    // Gera QR Code
    const qrBuffer = await QRCode.toBuffer(payloadPix, {
      type: 'png', width: 400, margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode-pix.png' });

    // Permissões do canal privado
    const permissionOverwrites = [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
        deny:  [PermissionFlagsBits.ManageChannels],
      },
    ];

    if (process.env.ADMIN_ROLE_ID) {
      permissionOverwrites.push({
        id: process.env.ADMIN_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      });
    }

    const channelOptions = {
      name: `compra-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      type: ChannelType.GuildText,
      topic: `Pedido de ${user.tag} — ${produto.name} — TXID: ${txid}`,
      permissionOverwrites,
    };

    if (process.env.COMPRA_CATEGORY_ID) channelOptions.parent = process.env.COMPRA_CATEGORY_ID;

    const canal = await guild.channels.create(channelOptions);

    // Salva pedido
    const pedido = await db.createOrder({
      userId:      user.id,
      username:    user.tag,
      productId:   produto.id,
      productName: produto.name,
      amount:      produto.price,
      channelId:   canal.id,
      pixTxid:     txid,
    });

    // Envia PIX no canal privado
    const embedPixMsg = embedPix(pedido, payloadPix);
    embedPixMsg.setImage('attachment://qrcode-pix.png');

    const rowFechar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`fechar_canal_${canal.id}`)
        .setLabel('🗑️ Fechar Canal')
        .setStyle(ButtonStyle.Danger),
    );

    await canal.send({
      content: `<@${user.id}> Seu canal de compra foi criado! 🎉`,
      embeds:  [embedPixMsg],
      files:   [qrAttachment],
      components: [rowFechar],
    });

    await interaction.editReply({
      embeds: [embedSucesso(
        `✅ Canal criado! Vá para ${canal} para pagar via PIX.\n\n` +
        `**📦 Produto:** ${produto.name}\n` +
        `**💰 Valor:** ${formatarValor(produto.price)}\n` +
        `**🆔 TXID:** \`${txid}\``
      )],
      components: [],
    });

  } catch (err) {
    console.error('[confirmar_compra]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro ao processar compra: ${err.message}`)] });
  }
}
