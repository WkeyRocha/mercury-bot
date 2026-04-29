const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('📌 [ADMIN] Posta a mensagem de loja fixa no canal atual')
  .addStringOption(opt =>
    opt
      .setName('banner')
      .setDescription('URL da imagem do banner (opcional)')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

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

function detectarEmoji(nome) {
  const n = nome.toLowerCase();
  if (n.includes('skill'))      return '✨';
  if (n.includes('crate'))      return '🎁';
  if (n.includes('key'))        return '🗝️';
  if (n.includes('shard'))      return '💎';
  if (n.includes('sword'))      return '⚔️';
  if (n.includes('relic'))      return '⚡';
  if (n.includes('grail'))      return '🏆';
  if (n.includes('sigil'))      return '🔮';
  if (n.includes('upgrade'))    return '🔧';
  return '🛍️';
}

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: '🚫 Apenas administradores.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos  = await db.getProducts();
    const bannerUrl = interaction.options.getString('banner') || null;

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

    // Embed principal
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛒 Bem-vindo à Loja!')
      .setDescription(
        '> Selecione um produto no menu abaixo para realizar sua compra.\n' +
        '> O pagamento é feito via **PIX** — rápido e seguro!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .setTimestamp()
      .setFooter({ text: 'Pagamento 100% via PIX • Entrega imediata' });

    if (bannerUrl) embed.setImage(bannerUrl);

    for (const [cat, itens] of Object.entries(categorias)) {
      const linhas = itens
        .map(p => `▸ ${p.name} — **${formatarValor(p.price)}**`)
        .join('\n');
      embed.addFields({ name: cat, value: linhas, inline: false });
    }

    // Menu de seleção — divide em chunks de 25 (limite do Discord)
    const chunks = [];
    for (let i = 0; i < produtos.length; i += 25) {
      chunks.push(produtos.slice(i, i + 25));
    }

    const rows = chunks.map((chunk, idx) => {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`selecionar_produto_${idx}`)
        .setPlaceholder(chunks.length > 1 ? `🛒 Selecione um produto (página ${idx + 1})` : '🛒 Selecione um produto...')
        .addOptions(
          chunk.map(p => ({
            label: p.name.substring(0, 100),
            description: formatarValor(p.price),
            value: p.id,
            emoji: detectarEmoji(p.name),
          }))
        );
      return new ActionRowBuilder().addComponents(menu);
    });

    await interaction.channel.send({ embeds: [embed], components: rows });
    await interaction.editReply({ content: '✅ Mensagem de loja postada!' });

  } catch (err) {
    console.error('[/setup]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

module.exports = { data, execute };
