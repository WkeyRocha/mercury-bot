const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('📌 [ADMIN] Posta a mensagem de loja fixa no canal atual')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// Agrupa produtos por categoria detectada no nome
function detectarCategoria(nome) {
  const n = nome.toLowerCase();
  if (n.includes('skill'))          return '✨ SKILLS';
  if (n.includes('crate'))          return '🎁 CAIXAS';
  if (n.includes('key') || n.includes('shard') || n.includes('sigil') ||
      n.includes('sword') || n.includes('relic') || n.includes('grail') ||
      n.includes('upgrade') || n.includes('transmutation'))
    return '🔧 ITENS & RECURSOS';
  return '🛍️ OUTROS';
}

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🚫 Apenas administradores.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos = await db.getProducts();
    if (!produtos.length) {
      return interaction.editReply({ content: '❌ Nenhum produto encontrado no banco.' });
    }

    // Agrupa por categoria
    const categorias = {};
    for (const p of produtos) {
      const cat = detectarCategoria(p.name);
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(p);
    }

    // Monta o embed principal
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛒 Bem-vindo à Loja!')
      .setDescription(
        '> Use `/comprar` para navegar pelo catálogo e realizar sua compra.\n' +
        '> O pagamento é feito via **PIX** — rápido e seguro!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .setTimestamp()
      .setFooter({ text: 'Pagamento 100% via PIX • Entrega imediata' });

    // Adiciona um field por categoria
    for (const [cat, itens] of Object.entries(categorias)) {
      const linhas = itens
        .map(p => `${p.name} — **${formatarValor(p.price)}**`)
        .join('\n');
      embed.addFields({ name: cat, value: linhas, inline: false });
    }

    // Botão de abrir catálogo
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('abrir_catalogo')
        .setLabel('🛒 Ver Catálogo e Comprar')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ Mensagem de loja postada!' });

  } catch (err) {
    console.error('[/setup]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

module.exports = { data, execute };
