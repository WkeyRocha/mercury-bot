const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { formatarValor } = require('./pix');
const { CORES } = require('./embeds');

async function enviarLog(client, { embeds, components } = {}) {
  const channelId = process.env.LOGS_CHANNEL_ID;
  if (!channelId) return null;
  try {
    const canal = await client.channels.fetch(channelId).catch(() => null);
    if (!canal) return null;
    return await canal.send({ embeds, components: components || [] });
  } catch (err) {
    console.error('[LOG]', err);
    return null;
  }
}

function msgCarrinhoCriado(user, produto, txid, pedidoId) {
  const embed = new EmbedBuilder()
    .setColor(CORES.aviso)
    .setTitle('🛒 Novo Carrinho — Aguardando Pagamento')
    .addFields(
      { name: '👤 Comprador', value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: '📦 Produto',   value: produto.name,                   inline: true },
      { name: '💰 Valor',     value: formatarValor(produto.price),   inline: true },
      { name: '🆔 TXID',      value: `\`${txid}\``,                  inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Use os botões para confirmar ou negar o pagamento' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pedido_confirmar_${pedidoId}`)
      .setLabel('✅ Confirmar Pagamento')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pedido_negar_${pedidoId}`)
      .setLabel('❌ Negar Pagamento')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

function msgVendaConfirmada(pedido, adminTag, deliveryNumber) {
  const embed = new EmbedBuilder()
    .setColor(CORES.sucesso)
    .setTitle('✅ Venda Confirmada')
    .addFields(
      { name: '👤 Comprador', value: `<@${pedido.user_id}> (${pedido.username})`, inline: true },
      { name: '📦 Produto',   value: pedido.product_name,                          inline: true },
      { name: '💰 Valor',     value: formatarValor(pedido.amount),                 inline: true },
      { name: '📬 Entrega',   value: `#${deliveryNumber}`,                         inline: true },
      { name: '👮 Admin',     value: adminTag,                                      inline: true },
      { name: '🆔 TXID',      value: `\`${pedido.pix_txid}\``,                     inline: false },
    )
    .setTimestamp()
    .setFooter({ text: 'Pagamento confirmado' });

  return { embeds: [embed], components: [] };
}

function msgVendaNegada(pedido, adminTag) {
  const embed = new EmbedBuilder()
    .setColor(CORES.erro)
    .setTitle('❌ Pagamento Negado')
    .addFields(
      { name: '👤 Comprador', value: `<@${pedido.user_id}> (${pedido.username})`, inline: true },
      { name: '📦 Produto',   value: pedido.product_name,                          inline: true },
      { name: '💰 Valor',     value: formatarValor(pedido.amount),                 inline: true },
      { name: '👮 Admin',     value: adminTag,                                      inline: true },
    )
    .setTimestamp()
    .setFooter({ text: 'Pagamento negado' });

  return { embeds: [embed], components: [] };
}

function msgProdutoCriado(produto, adminTag) {
  const embed = new EmbedBuilder()
    .setColor(CORES.info)
    .setTitle('➕ Produto Criado')
    .addFields(
      { name: '📦 Nome',      value: produto.name,                 inline: true },
      { name: '💰 Preço',     value: formatarValor(produto.price), inline: true },
      { name: '👮 Admin',     value: adminTag,                      inline: true },
      { name: '📝 Descrição', value: produto.description,          inline: false },
    )
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

function msgProdutoEditado(produto, adminTag) {
  const embed = new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle('✏️ Produto Editado')
    .addFields(
      { name: '📦 Nome',  value: produto.name,                 inline: true },
      { name: '💰 Preço', value: formatarValor(produto.price), inline: true },
      { name: '👮 Admin', value: adminTag,                      inline: true },
    )
    .setTimestamp();

  return { embeds: [embed], components: [] };
}

module.exports = {
  enviarLog,
  msgCarrinhoCriado,
  msgVendaConfirmada,
  msgVendaNegada,
  msgProdutoCriado,
  msgProdutoEditado,
};
