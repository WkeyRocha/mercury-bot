const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { embedPedidoAdmin, embedErro, embedSucesso, CORES } = require('../utils/embeds');
const { formatarValor } = require('../utils/pix');
const { EmbedBuilder } = require('discord.js');

// ── Verifica se usuário é admin ───────────────────────────
function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

// ── Botões de ação de pedido ──────────────────────────────
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

// ── Embed lista de pedidos ────────────────────────────────
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
    const emoji  = { pending: '⏳', confirmed: '✅', denied: '❌' }[p.status] || '❓';
    const data   = `<t:${Math.floor(new Date(p.created_at).getTime() / 1000)}:d>`;
    return `${i + 1}. ${emoji} **${p.product_name}** — ${formatarValor(p.amount)}\n   👤 ${p.username} · ${data}`;
  }).join('\n\n');

  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle(`📋 Pedidos — ${filtroLabel[filtro]}`)
    .setDescription(linhas)
    .setFooter({ text: `${pedidos.length} pedido(s) encontrado(s) • Use o menu abaixo para filtrar` })
    .setTimestamp();
}

// ── Comando /pedidos ──────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName('pedidos')
  .setDescription('📋 [ADMIN] Gerenciar pedidos da loja')
  .setDefaultMemberPermissions(0)
  .addStringOption(opt =>
    opt
      .setName('filtro')
      .setDescription('Filtrar pedidos por status')
      .addChoices(
        { name: '📋 Todos', value: 'all' },
        { name: '⏳ Pendentes', value: 'pending' },
        { name: '✅ Confirmados', value: 'confirmed' },
        { name: '❌ Negados', value: 'denied' },
      )
  );

async function execute(interaction) {
  // Verifica permissão
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [embedErro('🚫 Apenas administradores podem usar este comando.')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const filtro  = interaction.options.getString('filtro') || 'pending';
    const pedidos = await db.getOrders(filtro === 'all' ? null : filtro);

    // Menu de seleção de filtro
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

    // Envia um embed por pedido (máx 5 pendentes de uma vez)
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
    await interaction.editReply({ embeds: [embedErro(`Erro ao carregar pedidos: ${err.message}`)] });
  }
}

// ── Handlers de botão e select menu ──────────────────────
async function handleButton(interaction) {
  const id = interaction.customId;

  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [embedErro('🚫 Apenas administradores podem usar estes botões.')],
      ephemeral: true,
    });
  }

  if (id.startsWith('pedido_confirmar_') || id.startsWith('pedido_negar_')) {
    await interaction.deferUpdate();

    const pedidoId = id.includes('confirmar') ? id.replace('pedido_confirmar_', '') : id.replace('pedido_negar_', '');
    const confirmar = id.startsWith('pedido_confirmar_');

    try {
      const pedido = await db.updateOrderStatus(
        pedidoId,
        confirmar ? 'confirmed' : 'denied',
        interaction.user.tag
      );

      // Atualiza o embed do pedido
      await interaction.editReply({
        embeds: [embedPedidoAdmin(pedido)],
        components: [botoesAcao(pedido.id, pedido.status)],
      });

      // Notifica o comprador no canal privado (se ainda existir)
      if (pedido.channel_id) {
        try {
          const canal = await interaction.guild.channels.fetch(pedido.channel_id).catch(() => null);
          if (canal) {
            const msg = confirmar
              ? `✅ <@${pedido.user_id}> Seu pagamento foi **confirmado** por ${interaction.user.tag}! Obrigado pela compra! 🎉`
              : `❌ <@${pedido.user_id}> Seu pagamento foi **negado** por ${interaction.user.tag}. Entre em contato com um administrador se tiver dúvidas.`;

            await canal.send({
              content: msg,
              embeds: [
                new EmbedBuilder()
                  .setColor(confirmar ? CORES.sucesso : CORES.erro)
                  .setTitle(confirmar ? '✅ Compra Confirmada!' : '❌ Compra Negada')
                  .setDescription(
                    confirmar
                      ? `Seu pedido de **${pedido.product_name}** foi confirmado! Você receberá o produto em breve.`
                      : `Seu pedido de **${pedido.product_name}** foi negado. Se o pagamento foi efetuado, entre em contato.`
                  )
                  .setTimestamp(),
              ],
            });

            // Agenda fechamento do canal após 5 min (se confirmado)
            if (confirmar) {
              setTimeout(async () => {
                try { await canal.delete('Compra confirmada — canal encerrado'); } catch {}
              }, 5 * 60 * 1000);
            }
          }
        } catch (e) {
          console.error('[notif canal]', e);
        }
      }

    } catch (err) {
      console.error('[pedido_btn]', err);
      await interaction.followUp({
        embeds: [embedErro(`Erro ao atualizar pedido: ${err.message}`)],
        ephemeral: true,
      });
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
