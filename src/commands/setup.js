const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');

const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('[ADMIN] Posta a mensagem de loja fixa no canal atual')
  .addStringOption(opt =>
    opt
      .setName('jogo')
      .setDescription('Nome do jogo/categoria para filtrar os produtos (ex: Kick a Luck Block)')
      .setRequired(false)
  )
  .addStringOption(opt =>
    opt
      .setName('banner')
      .setDescription('URL da imagem do banner (opcional)')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ content: 'Apenas administradores.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const jogoFiltro = interaction.options.getString('jogo')?.trim() || null;
    const bannerUrl  = interaction.options.getString('banner') || null;

    let produtos = await db.getProducts();

    if (!produtos.length) {
      return interaction.editReply({ content: 'Nenhum produto encontrado no banco.' });
    }

    // Filtra pelo jogo/categoria se informado
    if (jogoFiltro) {
      const filtrados = produtos.filter(p =>
        p.category_name?.toLowerCase() === jogoFiltro.toLowerCase()
      );

      if (!filtrados.length) {
        return interaction.editReply({
          content:
            `Nenhum produto encontrado para o jogo **${jogoFiltro}**.\n` +
            `Verifique se a categoria existe e se há produtos ativos nela.\n\n` +
            `Categorias disponíveis: ${[...new Set(produtos.map(p => p.category_name).filter(Boolean))].join(', ') || 'nenhuma'}`,
        });
      }

      produtos = filtrados;
    }

    // Ordena por categoria → nome
    produtos.sort((a, b) => {
      const ordemA = a.category_sort_order ?? 9999;
      const ordemB = b.category_sort_order ?? 9999;
      if (ordemA !== ordemB) return ordemA - ordemB;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    // Agrupa por subcategoria (se setup sem filtro de jogo)
    // Se filtrou por jogo, não mostra subcategoria para ficar limpo
    const agruparPorCategoria = !jogoFiltro;
    const titulo = jogoFiltro ? `🛒 Loja — ${jogoFiltro}` : '🛒 Bem-vindo à Loja!';
    const descricao = jogoFiltro
      ? `> Produtos disponíveis para **${jogoFiltro}**.\n> Selecione um item abaixo para comprar via PIX.\n\n━━━━━━━━━━━━━━━━━━━━━━`
      : '> Selecione um produto no menu abaixo para realizar sua compra.\n> O pagamento é feito via PIX.\n\n━━━━━━━━━━━━━━━━━━━━━━';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(titulo)
      .setDescription(descricao)
      .setTimestamp()
      .setFooter({ text: 'Pagamento via PIX | Entrega após confirmação' });

    if (bannerUrl) embed.setImage(bannerUrl);

    if (agruparPorCategoria) {
      // Agrupado por categoria (setup geral)
      const categorias = {};
      for (const p of produtos) {
        const cat = p.category_name || 'OUTROS';
        if (!categorias[cat]) categorias[cat] = [];
        categorias[cat].push(p);
      }
      for (const [cat, itens] of Object.entries(categorias)) {
        const linhas = itens
          .map(p => `- ${p.name} — **${formatarValor(p.price)}**`)
          .join('\n');
        embed.addFields({ name: cat, value: linhas.substring(0, 1024), inline: false });
      }
    } else {
      // Lista simples (setup de jogo específico)
      const linhas = produtos
        .map(p => `- ${p.name} — **${formatarValor(p.price)}**`)
        .join('\n');
      embed.addFields({ name: 'Produtos disponíveis', value: linhas.substring(0, 1024), inline: false });
    }

    // Monta os menus de seleção (máx 25 por menu, máx 4 menus = 100 produtos)
    const chunks = [];
    for (let i = 0; i < produtos.length; i += 25) {
      chunks.push(produtos.slice(i, i + 25));
    }

    const rows = chunks.slice(0, 4).map((chunk, idx) => {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`selecionar_produto_${idx}`)
        .setPlaceholder(
          chunks.length > 1
            ? `Selecione um produto (página ${idx + 1})`
            : 'Selecione um produto...'
        )
        .addOptions(
          chunk.map(p => ({
            label: p.name.substring(0, 100),
            description: `${formatarValor(p.price)}`.substring(0, 100),
            value: p.id,
          }))
        );
      return new ActionRowBuilder().addComponents(menu);
    });

    await interaction.channel.send({ embeds: [embed], components: rows });
    await interaction.editReply({
      content: jogoFiltro
        ? `✅ Loja de **${jogoFiltro}** postada com ${produtos.length} produto(s)!`
        : `✅ Loja geral postada com ${produtos.length} produto(s)!`,
    });
  } catch (err) {
    console.error('[/setup]', err);
    await interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

module.exports = { data, execute };
