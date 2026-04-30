const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('[ADMIN] Posta a mensagem de loja fixa no canal atual')
  .addStringOption(opt =>
    opt
      .setName('banner')
      .setDescription('URL da imagem do banner (opcional)')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Apenas administradores.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos = await db.getProducts();
    const bannerUrl = interaction.options.getString('banner') || null;

    if (!produtos.length) {
      return interaction.editReply({ content: 'Nenhum produto encontrado no banco.' });
    }

    const produtosOrdenados = [...produtos].sort((a, b) => {
      const ordemA = a.category_sort_order ?? 9999;
      const ordemB = b.category_sort_order ?? 9999;
      if (ordemA !== ordemB) return ordemA - ordemB;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    const categorias = {};
    for (const p of produtosOrdenados) {
      const cat = p.category_name || 'OUTROS';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(p);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Bem-vindo a Loja!')
      .setDescription(
        '> Selecione um produto no menu abaixo para realizar sua compra.\n' +
        '> O pagamento e feito via PIX.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━'
      )
      .setTimestamp()
      .setFooter({ text: 'Pagamento via PIX | Entrega apos confirmacao' });

    if (bannerUrl) embed.setImage(bannerUrl);

    for (const [cat, itens] of Object.entries(categorias)) {
      const linhas = itens
        .map(p => `- ${p.name} - **${formatarValor(p.price)}**`)
        .join('\n');
      embed.addFields({ name: cat, value: linhas.substring(0, 1024), inline: false });
    }

    const chunks = [];
    for (let i = 0; i < produtosOrdenados.length; i += 25) {
      chunks.push(produtosOrdenados.slice(i, i + 25));
    }

    const rows = chunks.map((chunk, idx) => {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`selecionar_produto_${idx}`)
        .setPlaceholder(chunks.length > 1 ? `Selecione um produto (pagina ${idx + 1})` : 'Selecione um produto...')
        .addOptions(
          chunk.map(p => ({
            label: p.name.substring(0, 100),
            description: `${p.category_name || 'Sem categoria'} - ${formatarValor(p.price)}`.substring(0, 100),
            value: p.id,
          }))
        );
      return new ActionRowBuilder().addComponents(menu);
    });

    await interaction.channel.send({ embeds: [embed], components: rows.slice(0, 5) });
    await interaction.editReply({ content: 'Mensagem de loja postada!' });
  } catch (err) {
    console.error('[/setup]', err);
    await interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

module.exports = { data, execute };
