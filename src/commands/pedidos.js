// Handlers dos botões de confirmar/negar que aparecem no canal de logs
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { CORES } = require('../utils/embeds');
const { formatarValor } = require('../utils/pix');
const { enviarLog, msgVendaConfirmada, msgVendaNegada } = require('../utils/logs');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: '🚫 Apenas administradores.', ephemeral: true });
  }

  if (!id.startsWith('pedido_confirmar_') && !id.startsWith('pedido_negar_')) return;

  await interaction.deferUpdate();

  const pedidoId  = id.startsWith('pedido_confirmar_')
    ? id.replace('pedido_confirmar_', '')
    : id.replace('pedido_negar_', '');
  const confirmar = id.startsWith('pedido_confirmar_');

  try {
    const pedido = await db.getOrderById(pedidoId);

    if (pedido.status !== 'pending') {
      await interaction.followUp({
        content: `⚠️ Este pedido já foi **${pedido.status === 'confirmed' ? 'confirmado' : 'negado'}** anteriormente.`,
        ephemeral: true,
      });
      return;
    }

    await db.updateOrderStatus(pedidoId, confirmar ? 'confirmed' : 'denied', interaction.user.tag);

    if (confirmar) {
      // Cria canal de entrega
      const deliveryNumber = await db.getNextDeliveryNumber();

      const permissionOverwrites = [
        { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: pedido.user_id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
        },
      ];

      if (process.env.ADMIN_ROLE_ID) {
        permissionOverwrites.push({
          id: process.env.ADMIN_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
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
      await db.updateDeliveryChannel(pedido.id, canalEntrega.id, deliveryNumber);

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
            .addFields({ name: '🆔 TXID', value: `\`${pedido.pix_txid}\`` })
            .setTimestamp()
            .setFooter({ text: `Confirmado por ${interaction.user.tag}` }),
        ],
      });

      // Avisa no canal de compra e fecha após 1 min
      if (pedido.channel_id) {
        const canalCompra = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);
        if (canalCompra) {
          await canalCompra.send({
            embeds: [
              new EmbedBuilder()
                .setColor(CORES.sucesso)
                .setTitle('✅ Pagamento Confirmado!')
                .setDescription(`<@${pedido.user_id}> Acesse ${canalEntrega} para sua entrega!\n\n*Este canal fecha em 1 minuto.*`)
                .setTimestamp(),
            ],
          });
          setTimeout(() => canalCompra.delete('Compra confirmada').catch(console.error), 60_000);
        }
      }

      // Atualiza mensagem de log — remove botões e mostra confirmado
      await enviarLog(interaction.client, msgVendaConfirmada(pedido, interaction.user.tag, deliveryNumber));
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(CORES.sucesso)
            .setTitle('✅ Pagamento Confirmado')
            .setDescription(`**${pedido.product_name}** — ${formatarValor(pedido.amount)}\n👤 ${pedido.username}\n👮 Confirmado por ${interaction.user.tag}`)
            .setTimestamp(),
        ],
        components: [],
      });

    } else {
      // Negado
      if (pedido.channel_id) {
        const canalCompra = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);
        if (canalCompra) {
          await canalCompra.send({
            embeds: [
              new EmbedBuilder()
                .setColor(CORES.erro)
                .setTitle('❌ Pagamento Negado')
                .setDescription(`<@${pedido.user_id}> Seu pagamento foi negado. Entre em contato com um administrador.`)
                .setTimestamp()
                .setFooter({ text: `Negado por ${interaction.user.tag}` }),
            ],
          });
        }
      }

      await enviarLog(interaction.client, msgVendaNegada(pedido, interaction.user.tag));
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(CORES.erro)
            .setTitle('❌ Pagamento Negado')
            .setDescription(`**${pedido.product_name}** — ${formatarValor(pedido.amount)}\n👤 ${pedido.username}\n👮 Negado por ${interaction.user.tag}`)
            .setTimestamp(),
        ],
        components: [],
      });
    }

  } catch (err) {
    console.error('[pedido_btn]', err);
    await interaction.followUp({ content: `❌ Erro: ${err.message}`, ephemeral: true });
  }
}

module.exports = { handleButton };
