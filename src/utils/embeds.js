const { EmbedBuilder } = require('discord.js');
const { formatarValor } = require('./pix');

const CORES = {
  primaria: 0x5865F2,
  sucesso: 0x57F287,
  erro: 0xED4245,
  aviso: 0xFEE75C,
  info: 0x5865F2,
  neutro: 0x2B2D31,
  pix: 0x32BCAD,
};

function embedProduto(produto, pagina, total) {
  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle(produto.name)
    .setDescription(produto.description)
    .setImage(produto.image_url || null)
    .addFields(
      { name: 'Preco', value: `**${formatarValor(produto.price)}**`, inline: true },
      { name: 'Categoria', value: produto.category_name || 'Sem categoria', inline: true },
      { name: 'ID', value: `\`${produto.id.split('-')[0]}\``, inline: true },
    )
    .setFooter({ text: `Produto ${pagina} de ${total} | Use o botao Comprar para adquirir` })
    .setTimestamp();
}

function embedPedidoAdmin(pedido) {
  const statusLabel = {
    pending: 'Aguardando',
    confirmed: 'Confirmado',
    denied: 'Negado',
    expired: 'Expirado',
  };

  return new EmbedBuilder()
    .setColor(pedido.status === 'confirmed' ? CORES.sucesso : pedido.status === 'denied' || pedido.status === 'expired' ? CORES.erro : CORES.aviso)
    .setTitle('Pedido')
    .addFields(
      { name: 'Comprador', value: `<@${pedido.user_id}> (${pedido.username})`, inline: true },
      { name: 'Produto', value: pedido.product_name, inline: true },
      { name: 'Valor', value: formatarValor(pedido.amount), inline: true },
      { name: 'Status', value: statusLabel[pedido.status] || pedido.status, inline: true },
      { name: 'TXID', value: `\`${pedido.pix_txid || 'N/A'}\``, inline: true },
      { name: 'Data', value: `<t:${Math.floor(new Date(pedido.created_at).getTime() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `ID: ${pedido.id}` })
    .setTimestamp();
}

function embedPix(pedido, payloadPix) {
  const linhas = [
    `Ola <@${pedido.user_id}>! Seu pedido foi criado. Realize o pagamento abaixo:`,
    '',
    `**Produto:** ${pedido.product_name}`,
    `**Valor:** ${formatarValor(pedido.amount)}`,
  ];

  if (pedido.coupon_code) {
    linhas.push(`**Cupom:** \`${pedido.coupon_code}\``, `**Desconto:** ${formatarValor(pedido.discount_amount || 0)}`);
  }

  if (pedido.expires_at) {
    linhas.push(`**Expira:** <t:${Math.floor(new Date(pedido.expires_at).getTime() / 1000)}:R>`);
  }

  linhas.push(
    '',
    `**Chave PIX (copia e cola):**\n\`\`\`\n${payloadPix}\n\`\`\``,
    '> Escaneie o QR Code acima ou use o copia e cola.',
    '',
    '**Apos realizar o pagamento, aguarde a confirmacao de um administrador.**',
  );

  return new EmbedBuilder()
    .setColor(CORES.pix)
    .setTitle('Pagamento via PIX')
    .setDescription(linhas.join('\n'))
    .addFields({ name: 'Identificador do Pedido', value: `\`${pedido.pix_txid}\``, inline: false })
    .setFooter({ text: 'Este canal sera arquivado apos a confirmacao | Nao compartilhe o codigo PIX' })
    .setTimestamp();
}

function embedDashboard(stats) {
  const fmt = (v) => formatarValor(v || 0);
  const n = (v) => Number(v || 0).toLocaleString('pt-BR');

  const topProdutos = stats.topProducts.length
    ? stats.topProducts
        .map(([nome, d], i) => `${i + 1}. **${nome}** - ${n(d.qty)} venda(s) - ${fmt(d.revenue)}`)
        .join('\n')
    : '_Sem dados_';

  const topCupons = stats.topCoupons?.length
    ? stats.topCoupons
        .map(([codigo, d], i) => `${i + 1}. **${codigo}** - ${n(d.qty)} uso(s) - ${fmt(d.discount)}`)
        .join('\n')
    : '_Sem cupons usados_';

  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle('Dashboard de Vendas')
    .setDescription('Resumo completo de pedidos, receita, descontos e avaliacoes')
    .addFields(
      {
        name: 'Pedidos',
        value: [
          `Confirmados: **${n(stats.totals.confirmed)}**`,
          `Pendentes: **${n(stats.totals.pending)}**`,
          `Expirados: **${n(stats.totals.expired)}**`,
          `Negados: **${n(stats.totals.denied)}**`,
          `Total: **${n(stats.totals.all)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Receita',
        value: [
          `Hoje: **${fmt(stats.revenue.today)}**`,
          `7 dias: **${fmt(stats.revenue.week)}**`,
          `Mes: **${fmt(stats.revenue.month)}**`,
          `Total: **${fmt(stats.revenue.total)}**`,
          `Pendente: **${fmt(stats.revenue.pending)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Descontos',
        value: [
          `Hoje: **${fmt(stats.discounts.today)}**`,
          `7 dias: **${fmt(stats.discounts.week)}**`,
          `Mes: **${fmt(stats.discounts.month)}**`,
          `Total: **${fmt(stats.discounts.total)}**`,
        ].join('\n'),
        inline: true,
      },
      { name: 'Top Produtos', value: topProdutos, inline: false },
      { name: 'Top Cupons', value: topCupons, inline: false },
      {
        name: 'Avaliacoes',
        value: stats.ratings.total
          ? `Media: **${stats.ratings.average.toFixed(1)}/5**\nTotal: **${n(stats.ratings.total)}**`
          : '_Sem avaliacoes_',
        inline: true,
      },
    )
    .setFooter({ text: 'Dados em tempo real | Supabase' })
    .setTimestamp();
}

function embedErro(msg) {
  return new EmbedBuilder()
    .setColor(CORES.erro)
    .setTitle('Erro')
    .setDescription(msg)
    .setTimestamp();
}

function embedSucesso(msg) {
  return new EmbedBuilder()
    .setColor(CORES.sucesso)
    .setTitle('Sucesso')
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
