const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const db = require('../database/supabase');
const { embedErro, embedSucesso } = require('../utils/embeds');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

const data = new SlashCommandBuilder()
  .setName('relatorio')
  .setDescription('[ADMIN] Exportar relatorio de vendas em CSV')
  .addStringOption(option =>
    option
      .setName('status')
      .setDescription('Filtrar por status do pedido')
      .setRequired(false)
      .addChoices(
        { name: 'Todos', value: 'all' },
        { name: 'Pendentes', value: 'pending' },
        { name: 'Confirmados', value: 'confirmed' },
        { name: 'Negados', value: 'denied' },
        { name: 'Expirados', value: 'expired' },
      )
  )
  .addIntegerOption(option =>
    option
      .setName('dias')
      .setDescription('Filtrar pelos ultimos X dias')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(365)
  );

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [embedErro('Apenas administradores podem exportar relatorios.')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const status = interaction.options.getString('status') || 'all';
    const dias = interaction.options.getInteger('dias');
    const pedidos = await db.getOrders(status === 'all' ? null : status);
    const filtrados = filtrarPorDias(pedidos, dias);

    if (!filtrados.length) {
      return interaction.editReply({
        embeds: [embedErro('Nenhum pedido encontrado com esses filtros.')],
      });
    }

    const csv = gerarCsv(filtrados);
    const nomeArquivo = `relatorio-vendas-${status}-${dias || 'todos'}d-${dataArquivo()}.csv`;
    const attachment = new AttachmentBuilder(Buffer.from(`\uFEFF${csv}`, 'utf8'), { name: nomeArquivo });

    const totais = calcularTotais(filtrados);
    await interaction.editReply({
      embeds: [
        embedSucesso(
          `Relatorio gerado com **${filtrados.length}** pedido(s).\n\n` +
          `**Receita confirmada:** ${formatMoney(totais.receitaConfirmada)}\n` +
          `**Valor pendente:** ${formatMoney(totais.valorPendente)}\n` +
          `**Descontos:** ${formatMoney(totais.descontos)}`
        ),
      ],
      files: [attachment],
    });
  } catch (err) {
    console.error('[/relatorio]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro ao gerar relatorio: ${err.message}`)] });
  }
}

function filtrarPorDias(pedidos, dias) {
  if (!dias) return pedidos;
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  return pedidos.filter(p => new Date(p.created_at).getTime() >= desde);
}

function gerarCsv(pedidos) {
  const headers = [
    'id',
    'status',
    'comprador_id',
    'comprador',
    'produto',
    'valor_original',
    'desconto',
    'valor_final',
    'cupom',
    'txid',
    'canal_compra',
    'canal_entrega',
    'numero_entrega',
    'confirmado_por',
    'confirmado_em',
    'expira_em',
    'expirado_em',
    'entregue_por',
    'entregue_em',
    'avaliacao',
    'comentario_avaliacao',
    'avaliado_em',
    'criado_em',
  ];

  const linhas = pedidos.map(p => [
    p.id,
    p.status,
    p.user_id,
    p.username,
    p.product_name,
    normalizarNumero(p.original_amount || p.amount),
    normalizarNumero(p.discount_amount || 0),
    normalizarNumero(p.amount),
    p.coupon_code || '',
    p.pix_txid || '',
    p.channel_id || '',
    p.delivery_channel_id || '',
    p.delivery_number || '',
    p.confirmed_by || '',
    p.confirmed_at || '',
    p.expires_at || '',
    p.expired_at || '',
    p.delivered_by || '',
    p.delivered_at || '',
    p.rating || '',
    p.rating_comment || '',
    p.rated_at || '',
    p.created_at || '',
  ]);

  return [headers, ...linhas].map(row => row.map(escapeCsv).join(',')).join('\r\n');
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizarNumero(value) {
  const num = Number(value || 0);
  return num.toFixed(2);
}

function calcularTotais(pedidos) {
  return pedidos.reduce((acc, p) => {
    const amount = Number(p.amount || 0);
    const discount = Number(p.discount_amount || 0);
    if (p.status === 'confirmed') acc.receitaConfirmada += amount;
    if (p.status === 'pending') acc.valorPendente += amount;
    acc.descontos += discount;
    return acc;
  }, { receitaConfirmada: 0, valorPendente: 0, descontos: 0 });
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function dataArquivo() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { data, execute };
