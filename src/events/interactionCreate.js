const dashboard = require('../commands/dashboard');
const setup = require('../commands/setup');
const comprar = require('../commands/comprar');
const produtos = require('../commands/produtos');
const pedidos = require('../commands/pedidos');
const relatorio = require('../commands/relatorio');

const fs = require('fs');
const path = require('path');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const db = require('../database/supabase');
const { gerarPayloadPix, gerarTxid, formatarValor } = require('../utils/pix');
const { embedPix, embedErro, embedSucesso } = require('../utils/embeds');
const { enviarLog, msgCarrinhoCriado } = require('../utils/logs');
const { scheduleOrderExpiration } = require('../utils/orderExpiry');

// ── QR Code estático ──────────────────────────────────────
// Coloque o arquivo qrcode-pix.png dentro de src/assets/
const QR_PATH = path.join(__dirname, '..', 'assets', 'qrcode-pix.png');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const handlers = {
        dashboard: dashboard.execute,
        setup: setup.execute,
        comprar: comprar.execute,
        produtos: produtos.execute,
        relatorio: relatorio.execute,
      };

      const handler = handlers[interaction.commandName];
      if (!handler) return;

      try {
        await handler(interaction);
      } catch (err) {
        console.error(`[/${interaction.commandName}]`, err);
        const msg = { content: 'Ocorreu um erro.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(console.error);
        else await interaction.reply(msg).catch(console.error);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id === 'modal_produto_novo' || id.startsWith('modal_produto_editar_') ||
          id === 'modal_cupom_novo' || id.startsWith('modal_cupom_editar_') ||
          id === 'modal_categoria_nova' || id.startsWith('modal_categoria_editar_')) {
        return produtos.handleModal(interaction);
      }
      if (id.startsWith('modal_compra_cupom:')) {
        return handleCupomCompra(interaction, id.split(':')[1]);
      }
      if (id.startsWith('modal_avaliacao:')) {
        return pedidos.handleModal(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const id = interaction.customId;
      try {
        if (id.startsWith('pedido_confirmar_') || id.startsWith('pedido_negar_') ||
            id.startsWith('entrega_confirmar_') || id.startsWith('entrega_excluir_')) {
          return pedidos.handleButton(interaction);
        }
        if (id.startsWith('avaliar_pedido:')) {
          return pedidos.handleButton(interaction);
        }
        if (id === 'dashboard_atualizar') return dashboard.handleButton(interaction);
        if (id === 'produto_novo' || id === 'cupom_novo' || id === 'categoria_nova' || id.startsWith('produto_editar_')) {
          return produtos.handleButton(interaction);
        }
        if (id === 'abrir_catalogo' || id.startsWith('cat_anterior_') || id.startsWith('cat_proximo_') || id.startsWith('comprar_')) {
          return comprar.handleButton(interaction);
        }
        if (id.startsWith('fechar_canal_')) {
          const canal = interaction.channel;
          if (!canal) return;
          await interaction.reply({ content: 'Fechando canal em 5 segundos...', ephemeral: true });
          setTimeout(() => canal.delete().catch(console.error), 5000);
          return;
        }
        if (id.startsWith('cupom_compra:')) {
          return interaction.showModal(buildCouponCheckoutModal(id.split(':')[1]));
        }
        if (id.startsWith('confirmar_compra:')) {
          const [, produtoId, cupomCode = ''] = id.split(':');
          return handleConfirmarCompra(interaction, produtoId, decodeURIComponent(cupomCode));
        }
        if (id.startsWith('confirmar_compra_')) {
          return handleConfirmarCompra(interaction, id.replace('confirmar_compra_', ''));
        }
        if (id === 'cancelar_compra') {
          await interaction.update({ content: 'Compra cancelada.', embeds: [], components: [] });
          return;
        }
      } catch (err) {
        console.error('[Button]', err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: `Erro: ${err.message}`, ephemeral: true }).catch(console.error);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      if (id === 'produto_editar_sel' || id === 'produto_toggle_sel' ||
          id === 'cupom_editar_sel' || id === 'cupom_toggle_sel' ||
          id === 'categoria_editar_sel' || id === 'categoria_toggle_sel') {
        return produtos.handleSelectMenu(interaction);
      }
      if (id.startsWith('selecionar_produto_')) return handleSelecionarProduto(interaction);
    }
  },
};

async function handleSelecionarProduto(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const produto = await db.getProductById(interaction.values[0]);
    await interaction.editReply(buildResumoCompra(produto));
  } catch (err) {
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}

async function handleCupomCompra(interaction, produtoId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const produto = await db.getProductById(produtoId);
    const codigo = db.normalizeCouponCode(interaction.fields.getTextInputValue('codigo_cupom'));
    const cupom = await db.getActiveCouponByCode(codigo);

    if (!cupom) {
      return interaction.editReply({ embeds: [embedErro('Cupom invalido ou inativo.')] });
    }

    const desconto = calcularDesconto(produto.price, cupom);
    if (desconto <= 0) {
      return interaction.editReply({ embeds: [embedErro('Este cupom nao gera desconto para esse produto.')] });
    }

    await interaction.editReply(buildResumoCompra(produto, cupom));
  } catch (err) {
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}

async function handleConfirmarCompra(interaction, produtoId, cupomCode = '') {
  await interaction.deferReply({ ephemeral: true });
  const { guild, user } = interaction;

  try {
    const produto = await db.getProductById(produtoId);
    const pedidoAberto = await db.getOpenOrderByUser(user.id);
    if (pedidoAberto) {
      const canalAberto = pedidoAberto.channel_id ? `<#${pedidoAberto.channel_id}>` : 'seu canal de compra aberto';
      return interaction.editReply({
        embeds: [embedErro(`Voce ja tem um pedido pendente em ${canalAberto}. Finalize, cancele ou aguarde expirar antes de abrir outro carrinho.`)],
      });
    }

    const cupom = cupomCode ? await db.getActiveCouponByCode(cupomCode) : null;
    if (cupomCode && !cupom) {
      return interaction.editReply({ embeds: [embedErro('Cupom invalido ou inativo. Gere a compra novamente sem cupom ou aplique outro cupom.')] });
    }
    const discountAmount = cupom ? calcularDesconto(produto.price, cupom) : 0;
    const amount = Math.max(Number(produto.price) - discountAmount, 0.01);
    const couponCode = cupom ? cupom.code : null;
    const txid = gerarTxid(user.username);

    const payloadPix = gerarPayloadPix({
      chave: process.env.PIX_CHAVE,
      nome: process.env.PIX_NOME,
      cidade: process.env.PIX_CIDADE,
      valor: amount,
      txid,
      descricao: `${produto.name} - ${user.username}`,
    });

    // ── QR Code estático ──────────────────────────────────
    const qrBuffer = fs.readFileSync(QR_PATH);
    const qrAttachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode-pix.png' });

    const perms = [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
        deny: [PermissionFlagsBits.ManageChannels],
      },
    ];

    if (process.env.ADMIN_ROLE_ID) {
      perms.push({
        id: process.env.ADMIN_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      });
    }

    const chanOpts = {
      name: `compra-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      type: ChannelType.GuildText,
      topic: `Pedido de ${user.tag} - ${produto.name} - TXID: ${txid}`,
      permissionOverwrites: perms,
    };
    if (process.env.COMPRA_CATEGORY_ID) chanOpts.parent = process.env.COMPRA_CATEGORY_ID;

    const canal = await guild.channels.create(chanOpts);
    const pedido = await db.createOrder({
      userId: user.id,
      username: user.tag,
      productId: produto.id,
      productName: produto.name,
      amount,
      originalAmount: produto.price,
      discountAmount,
      couponCode,
      channelId: canal.id,
      pixTxid: txid,
    });
    scheduleOrderExpiration(interaction.client, pedido);

    await enviarLog(interaction.client, msgCarrinhoCriado(user, produto, txid, pedido.id, pedido));

    const embedPixMsg = embedPix(pedido, payloadPix);
    embedPixMsg.setImage('attachment://qrcode-pix.png');

    await canal.send({
      content: `<@${user.id}> Seu canal de compra foi criado!`,
      embeds: [embedPixMsg],
      files: [qrAttachment],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fechar_canal_${canal.id}`).setLabel('Fechar Canal').setStyle(ButtonStyle.Danger)
      )],
    });

    const linhas = [
      `Canal criado! Va para ${canal} para pagar via PIX.`,
      '',
      `**Produto:** ${produto.name}`,
      `**Valor:** ${formatarValor(amount)}`,
    ];
    if (couponCode) {
      linhas.push(`**Cupom:** \`${couponCode}\``, `**Desconto:** ${formatarValor(discountAmount)}`);
    }
    linhas.push(`**TXID:** \`${txid}\``);

    await interaction.editReply({
      embeds: [embedSucesso(linhas.join('\n'))],
      components: [],
    });
  } catch (err) {
    console.error('[confirmar_compra]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}

function buildResumoCompra(produto, cupom = null) {
  const discountAmount = cupom ? calcularDesconto(produto.price, cupom) : 0;
  const amount = Math.max(Number(produto.price) - discountAmount, 0.01);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(produto.name)
    .setDescription(produto.description)
    .addFields(
      { name: 'Preco', value: `**${formatarValor(produto.price)}**`, inline: true },
      { name: 'Total', value: `**${formatarValor(amount)}**`, inline: true },
      { name: 'Categoria', value: produto.category_name || 'Sem categoria', inline: true },
    )
    .setFooter({ text: 'Confirme para prosseguir com o pagamento via PIX' })
    .setTimestamp();

  if (cupom) {
    embed.addFields(
      { name: 'Cupom', value: `\`${cupom.code}\``, inline: true },
      { name: 'Desconto', value: formatarValor(discountAmount), inline: true },
    );
  }

  if (produto.image_url) embed.setImage(produto.image_url);

  const cupomCode = cupom ? encodeURIComponent(cupom.code) : '';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirmar_compra:${produto.id}:${cupomCode}`).setLabel('Confirmar Compra').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cupom_compra:${produto.id}`).setLabel(cupom ? 'Trocar Cupom' : 'Colocar Cupom').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cancelar_compra').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row] };
}

function buildCouponCheckoutModal(produtoId) {
  return new ModalBuilder()
    .setCustomId(`modal_compra_cupom:${produtoId}`)
    .setTitle('Aplicar Cupom')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo_cupom')
          .setLabel('Codigo do cupom')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(32)
          .setRequired(true)
      )
    );
}

function calcularDesconto(preco, cupom) {
  const valor = Number(cupom.discount_value);
  const precoNum = Number(preco);
  if (cupom.discount_type === 'percent') {
    return Math.min(precoNum * (valor / 100), precoNum - 0.01);
  }
  return Math.min(valor, precoNum - 0.01);
}
