const { EmbedBuilder, Colors } = require('discord.js');
const { formatarValor } = require('./pix');

const CORES = {
  primaria:  0x5865F2, // Blurple Discord
  sucesso:   0x57F287, // Verde
  erro:      0xED4245, // Vermelho
  aviso:     0xFEE75C, // Amarelo
  info:      0x5865F2, // Azul
  neutro:    0x2B2D31, // Escuro
  pix:       0x32BCAD, // Verde PIX
};

function embedProduto(produto, pagina, total) {
  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle(`🛍️ ${produto.name}`)
    .setDescription(produto.description)
    .setImage(produto.image_url || null)
    .addFields(
      { name: '💰 Preço', value: `**${formatarValor(produto.price)}**`, inline: true },
      { name: '📦 ID', value: `\`${produto.id.split('-')[0]}\``, inline: true },
    )
    .setFooter({ text: `Produto ${pagina} de ${total} • Use o botão Comprar para adquirir` })
    .setTimestamp();
}

function embedPedidoAdmin(pedido) {
  const statusEmoji = {
    pending:   '⏳',
    confirmed: '✅',
    denied:    '❌',
  };
  const statusLabel = {
    pending:   'Aguardando',
    confirmed: 'Confirmado',
    denied:    'Negado',
  };

  return new EmbedBuilder()
    .setColor(pedido.status === 'confirmed' ? CORES.sucesso : pedido.status === 'denied' ? CORES.erro : CORES.aviso)
    .setTitle(`${statusEmoji[pedido.status] || '❓'} Pedido`)
    .addFields(
      { name: '👤 Comprador',    value: `<@${pedido.user_id}> (${pedido.username})`, inline: true },
      { name: '🛍️ Produto',     value: pedido.product_name, inline: true },
      { name: '💰 Valor',       value: formatarValor(pedido.amount), inline: true },
      { name: '📋 Status',      value: `${statusEmoji[pedido.status]} ${statusLabel[pedido.status]}`, inline: true },
      { name: '🆔 TXID',        value: `\`${pedido.pix_txid || 'N/A'}\``, inline: true },
      { name: '📅 Data',        value: `<t:${Math.floor(new Date(pedido.created_at).getTime() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `ID: ${pedido.id}` })
    .setTimestamp();
}

function embedPix(pedido, payloadPix) {
  return new EmbedBuilder()
    .setColor(CORES.pix)
    .setTitle('💠 Pagamento via PIX')
    .setDescription(
      `Olá <@${pedido.user_id}>! Seu pedido foi criado. Realize o pagamento abaixo:\n\n` +
      `**📦 Produto:** ${pedido.product_name}\n` +
      `**💰 Valor:** ${formatarValor(pedido.amount)}\n\n` +
      `**🔑 Chave PIX (copia e cola):**\n\`\`\`\n${payloadPix}\n\`\`\`\n` +
      `> 📸 Ou escaneie o QR Code acima\n\n` +
      `⚠️ **Após realizar o pagamento, aguarde a confirmação de um administrador.**`
    )
    .addFields(
      { name: '🆔 Identificador do Pedido', value: `\`${pedido.pix_txid}\``, inline: false },
    )
    .setFooter({ text: 'Este canal será arquivado após a confirmação • Não compartilhe o código PIX' })
    .setTimestamp();
}

function embedDashboard(stats) {
  const fmt = (v) => formatarValor(v);
  const n   = (v) => v.toLocaleString('pt-BR');

  const topProdutos = stats.topProducts.length
    ? stats.topProducts
        .map(([nome, d], i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${nome}** — ${n(d.qty)} vendas · ${fmt(d.revenue)}`)
        .join('\n')
    : '_Sem dados_';

  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle('📊 Dashboard de Vendas')
    .setDescription('Resumo completo de pedidos e receita')
    .addFields(
      // Totais
      {
        name: '📦 Pedidos — Totais',
        value: [
          `✅ Confirmados: **${n(stats.totals.confirmed)}**`,
          `⏳ Pendentes:   **${n(stats.totals.pending)}**`,
          `❌ Negados:     **${n(stats.totals.denied)}**`,
          `📋 Total:       **${n(stats.totals.all)}**`,
        ].join('\n'),
        inline: true,
      },
      // Receita
      {
        name: '💰 Receita',
        value: [
          `📅 Hoje:   **${fmt(stats.revenue.today)}**`,
          `📆 7 dias: **${fmt(stats.revenue.week)}**`,
          `🗓️ Mês:   **${fmt(stats.revenue.month)}**`,
          `🏦 Total:  **${fmt(stats.revenue.total)}**`,
        ].join('\n'),
        inline: true,
      },
      // Pedidos por período
      {
        name: '📈 Volume de Pedidos',
        value: [
          `📅 Hoje:   **${n(stats.counts.today)}**`,
          `📆 7 dias: **${n(stats.counts.week)}**`,
          `🗓️ Mês:   **${n(stats.counts.month)}**`,
        ].join('\n'),
        inline: true,
      },
      // Top produtos
      {
        name: '🏆 Top Produtos (por receita)',
        value: topProdutos,
        inline: false,
      },
    )
    .setFooter({ text: 'Dados em tempo real • Supabase' })
    .setTimestamp();
}

function embedErro(msg) {
  return new EmbedBuilder()
    .setColor(CORES.erro)
    .setTitle('❌ Erro')
    .setDescription(msg)
    .setTimestamp();
}

function embedSucesso(msg) {
  return new EmbedBuilder()
    .setColor(CORES.sucesso)
    .setTitle('✅ Sucesso')
    .setDescription(msg)
    .setTimestamp();
}

module.exports = {
  CORES,
  embedProduto,
  embedPedidoAdmin,
  embedPix,
  embedDashboard,
  embedErro,
  embedSucesso,
};
