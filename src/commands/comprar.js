const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const QRCode     = require('qrcode');
const db         = require('../database/supabase');
const { gerarPayloadPix, gerarTxid, formatarValor } = require('../utils/pix');
const { embedProduto, embedPix, embedErro, embedSucesso } = require('../utils/embeds');

// ── Botões de navegação ───────────────────────────────────
function botoesNavegacao(pagina, total, produtoId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cat_anterior_${pagina}`)
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pagina === 0),
    new ButtonBuilder()
      .setCustomId(`cat_proximo_${pagina}_${total}`)
      .setLabel('Próximo ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pagina === total - 1),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`comprar_${produtoId}`)
      .setLabel('🛒 Comprar')
      .setStyle(ButtonStyle.Success),
  );

  return [row1, row2];
}

// ── Comando /comprar ──────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName('comprar')
  .setDescription('📦 Veja o catálogo de produtos disponíveis');

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos = await db.getProducts();

    if (!produtos.length) {
      return interaction.editReply({
        embeds: [embedErro('Nenhum produto disponível no momento.')],
      });
    }

    const pagina = 0;
    const produto = produtos[pagina];

    await interaction.editReply({
      embeds: [embedProduto(produto, pagina + 1, produtos.length)],
      components: botoesNavegacao(pagina, produtos.length, produto.id),
    });
  } catch (err) {
    console.error('[/comprar]', err);
    await interaction.editReply({ embeds: [embedErro('Erro ao carregar catálogo.')] });
  }
}

// ── Handler de interações dos botões do catálogo ──────────
async function handleButton(interaction) {
  const id = interaction.customId;

  // ── Botão "Ver Catálogo" da mensagem fixa ────────────
  if (id === 'abrir_catalogo') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const produtos = await db.getProducts();
      if (!produtos.length) {
        return interaction.editReply({ content: '❌ Nenhum produto disponível.' });
      }
      const pagina = 0;
      const produto = produtos[pagina];
      return interaction.editReply({
        embeds: [embedProduto(produto, pagina + 1, produtos.length)],
        components: botoesNavegacao(pagina, produtos.length, produto.id),
      });
    } catch (err) {
      return interaction.editReply({ content: '❌ Erro ao abrir catálogo.' });
    }
  }

  // ── Navegar no catálogo ──────────────────────────────
  if (id.startsWith('cat_anterior_') || id.startsWith('cat_proximo_')) {
    await interaction.deferUpdate();

    const produtos = await db.getProducts();
    let pagina;

    if (id.startsWith('cat_anterior_')) {
      pagina = Math.max(0, parseInt(id.split('_')[2]) - 1);
    } else {
      // cat_proximo_PAGINA_TOTAL
      const parts = id.split('_');
      pagina = Math.min(parseInt(parts[2]) + 1, parseInt(parts[3]) - 1);
    }

    const produto = produtos[pagina];
    await interaction.editReply({
      embeds: [embedProduto(produto, pagina + 1, produtos.length)],
      components: botoesNavegacao(pagina, produtos.length, produto.id),
    });
    return;
  }

  // ── Botão Comprar ─────────────────────────────────────
  if (id.startsWith('comprar_')) {
    await interaction.deferReply({ ephemeral: true });

    const produtoId = id.replace('comprar_', '');
    const guild     = interaction.guild;
    const user      = interaction.user;

    try {
      const produto = await db.getProductById(produtoId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(produto.name)
        .setDescription(produto.description)
        .addFields(
          { name: 'Preco', value: `**${formatarValor(produto.price)}**`, inline: true },
          { name: 'Categoria', value: produto.category_name || 'Sem categoria', inline: true },
        )
        .setFooter({ text: 'Confirme para prosseguir com o pagamento via PIX' })
        .setTimestamp();

      if (produto.image_url) embed.setImage(produto.image_url);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`confirmar_compra:${produto.id}:`).setLabel('Confirmar Compra').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cupom_compra:${produto.id}`).setLabel('Colocar Cupom').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cancelar_compra').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;

      // Gera txid único
      const txid = gerarTxid(user.username);

      // Gera payload PIX
      const payloadPix = gerarPayloadPix({
        chave:    process.env.PIX_CHAVE,
        nome:     process.env.PIX_NOME,
        cidade:   process.env.PIX_CIDADE,
        valor:    produto.price,
        txid,
        descricao: `${produto.name} - ${user.username}`,
      });

      // Gera QR Code como buffer
      const qrBuffer = await QRCode.toBuffer(payloadPix, {
        type: 'png',
        width: 400,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode-pix.png' });

      // ── Cria o canal privado de compra ────────────────
      const categoryId = process.env.COMPRA_CATEGORY_ID;

      const channelOptions = {
        name: `compra-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        type: ChannelType.GuildText,
        topic: `Pedido de ${user.tag} — ${produto.name} — TXID: ${txid}`,
        permissionOverwrites: [
          {
            // Nega acesso a todos (@everyone)
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            // Permite acesso ao comprador
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
            ],
          },
        ],
      };

      // Adiciona permissão ao cargo admin (se configurado)
      if (process.env.ADMIN_ROLE_ID) {
        channelOptions.permissionOverwrites.push({
          id: process.env.ADMIN_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        });
      }

      if (categoryId) channelOptions.parent = categoryId;

      const canal = await guild.channels.create(channelOptions);

      // Salva pedido no banco
      const pedido = await db.createOrder({
        userId:      user.id,
        username:    user.tag,
        productId:   produto.id,
        productName: produto.name,
        amount:      produto.price,
        channelId:   canal.id,
        pixTxid:     txid,
      });

      // Envia embed PIX no canal privado
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

      // Responde ao usuário com link do canal
      await interaction.editReply({
        embeds: [
          embedSucesso(
            `✅ Canal de compra criado! Vá para ${canal} para ver as instruções de pagamento PIX.\n\n` +
            `**📦 Produto:** ${produto.name}\n` +
            `**🆔 TXID:** \`${txid}\``
          ),
        ],
      });

    } catch (err) {
      console.error('[comprar_btn]', err);
      await interaction.editReply({ embeds: [embedErro(`Erro ao processar compra: ${err.message}`)] });
    }
    return;
  }

  // ── Fechar canal ──────────────────────────────────────
  if (id.startsWith('fechar_canal_')) {
    const canal = interaction.channel;
    if (!canal) return;

    await interaction.reply({ content: '🗑️ Fechando canal em 5 segundos...', ephemeral: true });
    setTimeout(() => canal.delete('Canal de compra encerrado').catch(console.error), 5000);
    return;
  }
}

module.exports = { data, execute, handleButton };
