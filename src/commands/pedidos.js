const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require('discord.js');
const db = require('../database/supabase');
const { embedPedidoAdmin, embedErro, embedSucesso, CORES } = require('../utils/embeds');
const { formatarValor } = require('../utils/pix');
const { enviarLog, logVendaConfirmada, logVendaNegada } = require('../utils/logs');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

function botoesAcao(pedidoId, status) {
  const row = new ActionRowBuilder();
  if (status === 'pending') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pedido_confirmar_${pedidoId}`)
        .setLabel('✅ Confirmar Compra')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`pedido_negar_${pedidoId}`)
        .setLabel('❌ Negar Compra')
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pedido_ver_${pedidoId}`)
        .setLabel(`Status: ${status === 'confirmed' ? '✅ Confirmado' : '❌ Negado'}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }
  return row;
}

function embedListaPedidos(pedidos, filtro) {
  const filtroLabel = { all: 'Todos', pending: 'Pendentes', confirmed: 'Confirmados', denied: 'Negados' };
  if (!pedidos.length) {
    return new EmbedBuilder()
      .setColor(CORES.neutro)
      .setTitle(`📋 Pedidos — ${filtroLabel[filtro]}`)
      .setDescription('_Nenhum pedido encontrado._')
      .setTimestamp();
  }
  const linhas = pedidos.slice(0, 10).map((p, i) => {
    const emoji = { pending: '⏳', confirmed: '✅', denied: '❌' }[p.status] || '❓';
    const data  = `<t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:d>`;
    return `${i + 1}. ${emoji} **${p.product_name}** — ${formatarValor(p.amount)}\n   👤 ${p.username} · ${data}`;
  }).join('\n\n');

  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle(`📋 Pedidos — ${filtroLabel[filtro]}`)
    .setDescription(linhas)
    .setFooter({ text: `${pedidos.length} pedido(s) encontrado(s)` })
    .setTimestamp();
}

const data = new SlashCommandBuilder()
  .setName('pedidos')
  .setDescription('📋 [ADMIN] Gerenciar pedidos da loja')
  .addStringOption(opt =>
    opt.setName('filtro')
      .setDescription('Filtrar pedidos por status')
      .addChoices(
        { name: '📋 Todos',       value: 'all' },
        { name: '⏳ Pendentes',   value: 'pending' },
        { name: '✅ Confirmados', value: 'confirmed' },
        { name: '❌ Negados',     value: 'denied' },
      )
  )
  .setDefaultMemberPermissions(0);

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [embedErro('🚫 Apenas administradores.')], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const filtro  = interaction.options.getString('filtro') || 'pending';
    const pedidos = await db.getOrders(filtro === 'all' ? null : filtro);

    const menuFiltro = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pedidos_filtro')
        .setPlaceholder('Filtrar por status...')
        .addOptions([
          { label: 'Todos',       value: 'all',       emoji: '📋' },
          { label: 'Pendentes',   value: 'pending',   emoji: '⏳' },
          { label: 'Confirmados', value: 'confirmed', emoji: '✅' },
          { label: 'Negados',     value: 'denied',    emoji: '❌' },
        ])
    );

    await interaction.editReply({
      embeds: [embedListaPedidos(pedidos, filtro)],
      components: [menuFiltro],
    });

    const pedidosParaMostrar = pedidos.filter(p => p.status === 'pending').slice(0, 5);
    for (const pedido of pedidosParaMostrar) {
      await interaction.followUp({
        embeds: [embedPedidoAdmin(pedido)],
        components: [botoesAcao(pedido.id, pedido.status)],
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error('[/pedidos]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro: ${err.message}`)] });
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ embeds: [embedErro('🚫 Apenas administradores.')], ephemeral: true });
  }

  if (id.startsWith('pedido_confirmar_') || id.startsWith('pedido_negar_')) {
    await interaction.deferUpdate();

    const pedidoId = id.includes('confirmar')
      ? id.replace('pedido_confirmar_', '')
      : id.replace('pedido_negar_', '');
    const confirmar = id.startsWith('pedido_confirmar_');

    try {
      const pedido = await db.updateOrderStatus(
        pedidoId,
        confirmar ? 'confirmed' : 'denied',
        interaction.user.tag
      );

      await interaction.editReply({
        embeds: [embedPedidoAdmin(pedido)],
        components: [botoesAcao(pedido.id, pedido.status)],
      });

      // ── Notifica no canal privado de compra ─────────────
      if (pedido.channel_id) {
        const canalCompra = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);

        if (confirmar) {
          // ── Cria canal de entrega ───────────────────────
          const deliveryNumber = await db.getNextDeliveryNumber();

          const permissionOverwrites = [
            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
            {
              id: pedido.user_id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.SendMessages,
              ],
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

          const canalOptions = {
            name: `entrega-${deliveryNumber}`,
            type: ChannelType.GuildText,
            topic: `Entrega #${deliveryNumber} — ${pedido.product_name} — ${pedido.username}`,
            permissionOverwrites,
          };

          if (process.env.ENTREGA_CATEGORY_ID) canalOptions.parent = process.env.ENTREGA_CATEGORY_ID;

          const canalEntrega = await interaction.guild.channels.create(canalOptions);

          // Salva o canal de entrega no pedido
          await db.updateDeliveryChannel(pedido.id, canalEntrega.id, deliveryNumber);

          // Log de venda confirmada
          await enviarLog(interaction.client, logVendaConfirmada(pedido, interaction.user.tag, deliveryNumber));

          // Mensagem no canal de entrega
          await canalEntrega.send({
            content: `<@${pedido.user_id}>`,
            embeds: [
              new EmbedBuilder()
                .setColor(CORES.sucesso)
                .setTitle(`📦 Entrega #${deliveryNumber}`)
                .setDescription(
                  `Olá <@${pedido.user_id}>! Seu pagamento foi confirmado! 🎉\n\n` +
                  `**🛍️ Produto:** ${pedido.product_name}\n` +
                  `**💰 Valor:** ${formatarValor(pedido.amount)}\n\n` +
                  `> Um administrador irá entregar seu produto em breve.\n` +
                  `> Qualquer dúvida, fale aqui neste canal.`
                )
                .addFields({ name: '🆔 TXID do Pagamento', value: `\`${pedido.pix_txid}\`` })
                .setTimestamp()
                .setFooter({ text: `Confirmado por ${interaction.user.tag}` }),
            ],
          });

          // Mensagem no canal de compra avisando
          if (canalCompra) {
            await canalCompra.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(CORES.sucesso)
                  .setTitle('✅ Pagamento Confirmado!')
                  .setDescription(
                    `<@${pedido.user_id}> Seu pagamento foi confirmado! 🎉\n\n` +
                    `Acesse o canal ${canalEntrega} para acompanhar sua entrega.\n\n` +
                    `*Este canal será fechado em 1 minuto.*`
                  )
                  .setTimestamp(),
              ],
            });

            // Fecha o canal de compra após 1 minuto
            setTimeout(async () => {
              await canalCompra.delete('Compra confirmada').catch(console.error);
            }, 60 * 1000);
          }

        } else {
          // Log de venda negada
          await enviarLog(interaction.client, logVendaNegada(pedido, interaction.user.tag));

          // Pagamento negado — avisa no canal de compra
          if (canalCompra) {
            await canalCompra.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(CORES.erro)
                  .setTitle('❌ Pagamento Negado')
                  .setDescription(
                    `<@${pedido.user_id}> Infelizmente seu pagamento foi **negado**.\n\n` +
                    `Se acredita que isso é um erro, entre em contato com um administrador.`
                  )
                  .setTimestamp()
                  .setFooter({ text: `Negado por ${interaction.user.tag}` }),
              ],
            });
          }
        }
      }

    } catch (err) {
      console.error('[pedido_btn]', err);
      await interaction.followUp({ embeds: [embedErro(`Erro: ${err.message}`)], ephemeral: true });
    }
  }
}

async function handleSelectMenu(interaction) {
  if (interaction.customId !== 'pedidos_filtro') return;
  if (!isAdmin(interaction.member)) return;

  await interaction.deferUpdate();

  try {
    const filtro  = interaction.values[0];
    const pedidos = await db.getOrders(filtro === 'all' ? null : filtro);

    const menuFiltro = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('pedidos_filtro')
        .setPlaceholder('Filtrar por status...')
        .addOptions([
          { label: 'Todos',       value: 'all',       emoji: '📋' },
          { label: 'Pendentes',   value: 'pending',   emoji: '⏳' },
          { label: 'Confirmados', value: 'confirmed', emoji: '✅' },
          { label: 'Negados',     value: 'denied',    emoji: '❌' },
        ])
    );

    await interaction.editReply({
      embeds: [embedListaPedidos(pedidos, filtro)],
      components: [menuFiltro],
    });
  } catch (err) {
    console.error('[pedidos_select]', err);
  }
}

module.exports = { data, execute, handleButton, handleSelectMenu };
