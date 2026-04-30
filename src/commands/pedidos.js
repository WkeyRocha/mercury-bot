const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../database/supabase');
const { CORES } = require('../utils/embeds');
const { formatarValor } = require('../utils/pix');
const { enviarLog, msgVendaConfirmada, msgVendaNegada, msgAvaliacaoRecebida } = require('../utils/logs');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith('pedido_confirmar_') || id.startsWith('pedido_negar_')) {
    return handlePedidoStatus(interaction, id);
  }

  if (id.startsWith('entrega_confirmar_')) {
    return handleEntregaConfirmada(interaction, id);
  }

  if (id.startsWith('avaliar_pedido:')) {
    return handleAvaliarPedido(interaction, id);
  }

  if (id.startsWith('entrega_excluir_')) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'Apenas administradores.', ephemeral: true });
    }

    await interaction.reply({ content: 'Excluindo canal em 5 segundos...', ephemeral: true });
    setTimeout(() => interaction.channel.delete('Entrega concluida').catch(console.error), 5000);
  }
}

async function handlePedidoStatus(interaction, id) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Apenas administradores.', ephemeral: true });
  }

  await interaction.deferUpdate();

  const pedidoId = id.startsWith('pedido_confirmar_')
    ? id.replace('pedido_confirmar_', '')
    : id.replace('pedido_negar_', '');
  const confirmar = id.startsWith('pedido_confirmar_');

  try {
    const pedido = await db.getOrderById(pedidoId);

    if (pedido.status !== 'pending') {
      return interaction.followUp({
        content: `Este pedido ja foi ${pedido.status === 'confirmed' ? 'confirmado' : pedido.status === 'expired' ? 'expirado' : 'negado'}.`,
        ephemeral: true,
      });
    }

    await db.updateOrderStatus(pedidoId, confirmar ? 'confirmed' : 'denied', interaction.user.tag);

    if (confirmar) {
      return confirmarPagamento(interaction, pedido);
    }

    return negarPagamento(interaction, pedido);
  } catch (err) {
    console.error('[pedido_btn]', err);
    return interaction.followUp({ content: `Erro: ${err.message}`, ephemeral: true });
  }
}

async function confirmarPagamento(interaction, pedido) {
  const deliveryNumber = await db.getNextDeliveryNumber();

  const perms = [
    { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: pedido.user_id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
    },
  ];

  if (process.env.ADMIN_ROLE_ID) {
    perms.push({
      id: process.env.ADMIN_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    });
  }

  const chanOpts = {
    name: `entrega-${deliveryNumber}`,
    type: ChannelType.GuildText,
    topic: `Entrega #${deliveryNumber} - ${pedido.product_name} - ${pedido.username}`,
    permissionOverwrites: perms,
  };
  if (process.env.ENTREGA_CATEGORY_ID) chanOpts.parent = process.env.ENTREGA_CATEGORY_ID;

  const canalEntrega = await interaction.guild.channels.create(chanOpts);
  await db.updateDeliveryChannel(pedido.id, canalEntrega.id, deliveryNumber);

  const rowEntrega = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`entrega_confirmar_${pedido.id}`)
      .setLabel('Confirmar Entrega')
      .setStyle(ButtonStyle.Primary),
  );

  await canalEntrega.send({
    content: `<@${pedido.user_id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(CORES.sucesso)
        .setTitle(`Entrega #${deliveryNumber}`)
        .setDescription(
          `Ola <@${pedido.user_id}>! Seu pagamento foi confirmado!\n\n` +
          `**Produto:** ${pedido.product_name}\n` +
          `**Valor:** ${formatarValor(pedido.amount)}\n\n` +
          '> Um administrador ira entregar seu produto em breve.'
        )
        .addFields({ name: 'TXID', value: `\`${pedido.pix_txid}\`` })
        .setTimestamp()
        .setFooter({ text: `Confirmado por ${interaction.user.tag}` }),
    ],
    components: [rowEntrega],
  });

  if (pedido.channel_id) {
    const canalCompra = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);
    if (canalCompra) {
      await canalCompra.send({
        embeds: [
          new EmbedBuilder()
            .setColor(CORES.sucesso)
            .setTitle('Pagamento Confirmado')
            .setDescription(`<@${pedido.user_id}> Acesse ${canalEntrega} para acompanhar sua entrega.\n\nEste canal fecha em 1 minuto.`)
            .setTimestamp(),
        ],
      });
      setTimeout(() => canalCompra.delete('Compra confirmada').catch(console.error), 60_000);
    }
  }

  await enviarLog(interaction.client, msgVendaConfirmada(pedido, interaction.user.tag, deliveryNumber));
  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(CORES.sucesso)
        .setTitle('Pagamento Confirmado')
        .setDescription(`**${pedido.product_name}** - ${formatarValor(pedido.amount)}\n${pedido.username}\nConfirmado por ${interaction.user.tag}`)
        .setTimestamp(),
    ],
    components: [],
  });
}

async function negarPagamento(interaction, pedido) {
  if (pedido.channel_id) {
    const canalCompra = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);
    if (canalCompra) {
      await canalCompra.send({
        embeds: [
          new EmbedBuilder()
            .setColor(CORES.erro)
            .setTitle('Pagamento Negado')
            .setDescription(`<@${pedido.user_id}> Seu pagamento foi negado. Entre em contato com um administrador.`)
            .setTimestamp()
            .setFooter({ text: `Negado por ${interaction.user.tag}` }),
        ],
      });
    }
  }

  await enviarLog(interaction.client, msgVendaNegada(pedido, interaction.user.tag));
  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(CORES.erro)
        .setTitle('Pagamento Negado')
        .setDescription(`**${pedido.product_name}** - ${formatarValor(pedido.amount)}\n${pedido.username}\nNegado por ${interaction.user.tag}`)
        .setTimestamp(),
    ],
    components: [],
  });
}

async function handleEntregaConfirmada(interaction, id) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Apenas administradores.', ephemeral: true });
  }

  await interaction.deferUpdate();
  const pedidoId = id.replace('entrega_confirmar_', '');

  try {
    const pedido = await db.getOrderById(pedidoId);
    const canal = interaction.channel;

    await db.markOrderDelivered(pedidoId, interaction.user.tag);
    await canal.setName(canal.name.replace('entrega-', 'entregue-')).catch(console.error);

    const rowAvaliacao = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`avaliar_pedido:${pedido.id}:5`).setLabel('5').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`avaliar_pedido:${pedido.id}:4`).setLabel('4').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`avaliar_pedido:${pedido.id}:3`).setLabel('3').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`avaliar_pedido:${pedido.id}:2`).setLabel('2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`avaliar_pedido:${pedido.id}:1`).setLabel('1').setStyle(ButtonStyle.Danger),
    );

    const rowExcluir = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`entrega_excluir_${canal.id}`)
        .setLabel('Excluir Canal')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(CORES.sucesso)
          .setTitle('Entrega Concluida')
          .setDescription(
            `<@${pedido.user_id}> Sua entrega foi concluida!\n\n` +
            `**Produto:** ${pedido.product_name}\n` +
            `**Valor:** ${formatarValor(pedido.amount)}\n\n` +
            'Avalie sua compra abaixo.'
          )
          .setTimestamp()
          .setFooter({ text: `Entregue por ${interaction.user.tag}` }),
      ],
      components: [rowAvaliacao, rowExcluir],
    });

    await enviarLog(interaction.client, {
      embeds: [
        new EmbedBuilder()
          .setColor(CORES.sucesso)
          .setTitle('Entrega Concluida')
          .addFields(
            { name: 'Comprador', value: `<@${pedido.user_id}> (${pedido.username})`, inline: true },
            { name: 'Produto', value: pedido.product_name, inline: true },
            { name: 'Admin', value: interaction.user.tag, inline: true },
          )
          .setTimestamp(),
      ],
      components: [],
    });
  } catch (err) {
    console.error('[entrega_confirmar]', err);
    return interaction.followUp({ content: `Erro: ${err.message}`, ephemeral: true });
  }
}

async function handleAvaliarPedido(interaction, id) {
  const [, pedidoId, nota] = id.split(':');
  const pedido = await db.getOrderById(pedidoId);

  if (interaction.user.id !== pedido.user_id) {
    return interaction.reply({ content: 'Apenas o comprador pode avaliar este pedido.', ephemeral: true });
  }

  if (pedido.rating) {
    return interaction.reply({ content: 'Este pedido ja foi avaliado. Obrigado!', ephemeral: true });
  }

  return interaction.showModal(buildRatingModal(pedidoId, nota));
}

async function handleModal(interaction) {
  const id = interaction.customId;
  if (!id.startsWith('modal_avaliacao:')) return;

  const [, pedidoId, notaStr] = id.split(':');
  const rating = Number(notaStr);
  const comment = interaction.fields.getTextInputValue('comentario').trim() || null;

  await interaction.deferReply({ ephemeral: true });

  try {
    const pedido = await db.getOrderById(pedidoId);

    if (interaction.user.id !== pedido.user_id) {
      return interaction.editReply({ content: 'Apenas o comprador pode avaliar este pedido.' });
    }

    if (pedido.rating) {
      return interaction.editReply({ content: 'Este pedido ja foi avaliado. Obrigado!' });
    }

    const atualizado = await db.rateOrder(pedidoId, rating, comment);
    await enviarLog(interaction.client, msgAvaliacaoRecebida(atualizado));
    return interaction.editReply({ content: `Obrigado pela avaliacao! Nota registrada: ${rating}/5.` });
  } catch (err) {
    console.error('[modal_avaliacao]', err);
    return interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

function buildRatingModal(pedidoId, nota) {
  return new ModalBuilder()
    .setCustomId(`modal_avaliacao:${pedidoId}:${nota}`)
    .setTitle(`Avaliar pedido - ${nota}/5`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comentario')
          .setLabel('Comentario opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(false)
      )
    );
}

module.exports = { handleButton, handleModal };
