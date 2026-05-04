const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');
const { CORES } = require('../utils/embeds');
const { enviarLog, msgProdutoCriado, msgProdutoEditado } = require('../utils/logs');

const data = new SlashCommandBuilder()
  .setName('produtos')
  .setDescription('📦 [ADMIN] Gerenciar produtos da loja')
  .setDefaultMemberPermissions(0);

// ── Lista todos os produtos com botões ────────────────────
async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos = await db.getAllProducts();

    if (!produtos.length) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('produto_novo')
          .setLabel('➕ Criar Primeiro Produto')
          .setStyle(ButtonStyle.Success),
      );
      return interaction.editReply({ content: '_Nenhum produto cadastrado._', components: [row] });
    }

    // Envia um embed por produto com botões de editar/toggle
    const embed = new EmbedBuilder()
      .setColor(CORES.primaria)
      .setTitle('📦 Gerenciar Produtos')
      .setDescription(`${produtos.length} produto(s) cadastrado(s). Use os botões abaixo de cada um para gerenciar.`)
      .setTimestamp();

    const rowNovo = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('produto_novo')
        .setLabel('➕ Novo Produto')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.editReply({ embeds: [embed], components: [rowNovo] });

    // Envia um followUp por produto (max 10)
    for (const p of produtos.slice(0, 10)) {
      const embedProduto = new EmbedBuilder()
        .setColor(p.active ? CORES.sucesso : CORES.neutro)
        .setTitle(`${p.active ? '✅' : '❌'} ${p.name}`)
        .addFields(
          { name: '💰 Preço',     value: formatarValor(p.price),        inline: true },
          { name: '📋 Status',    value: p.active ? 'Ativo' : 'Inativo', inline: true },
          { name: '📝 Descrição', value: p.description.substring(0, 100), inline: false },
        );

      if (p.image_url) embedProduto.setThumbnail(p.image_url);

      const rowAcoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`produto_editar_${p.id}`)
          .setLabel('✏️ Editar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`produto_toggle_${p.id}`)
          .setLabel(p.active ? '❌ Desativar' : '✅ Ativar')
          .setStyle(p.active ? ButtonStyle.Danger : ButtonStyle.Success),
      );

      await interaction.followUp({ embeds: [embedProduto], components: [rowAcoes], ephemeral: true });
    }

  } catch (err) {
    console.error('[/produtos]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

// ── Handlers de botão ─────────────────────────────────────
async function handleButton(interaction) {
  const id = interaction.customId;

  // Novo produto
  if (id === 'produto_novo') {
    return interaction.showModal(buildModal('novo'));
  }

  // Editar produto
  if (id.startsWith('produto_editar_')) {
    const produtoId = id.replace('produto_editar_', '');
    try {
      const produto = await db.getProductById(produtoId);
      return interaction.showModal(buildModal('editar', produto));
    } catch (err) {
      return interaction.reply({ content: `❌ Erro ao carregar produto: ${err.message}`, ephemeral: true });
    }
  }

  // Toggle ativar/desativar
  if (id.startsWith('produto_toggle_')) {
    await interaction.deferUpdate();
    const produtoId = id.replace('produto_toggle_', '');
    try {
      const produto = await db.getProductById(produtoId);
      const novoStatus = !produto.active;
      await db.toggleProduto(produtoId, novoStatus);

      const embedAtualizado = new EmbedBuilder()
        .setColor(novoStatus ? CORES.sucesso : CORES.neutro)
        .setTitle(`${novoStatus ? '✅' : '❌'} ${produto.name}`)
        .addFields(
          { name: '💰 Preço',     value: formatarValor(produto.price),       inline: true },
          { name: '📋 Status',    value: novoStatus ? 'Ativo' : 'Inativo',   inline: true },
          { name: '📝 Descrição', value: produto.description.substring(0, 100), inline: false },
        );

      if (produto.image_url) embedAtualizado.setThumbnail(produto.image_url);

      const rowAcoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`produto_editar_${produto.id}`)
          .setLabel('✏️ Editar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`produto_toggle_${produto.id}`)
          .setLabel(novoStatus ? '❌ Desativar' : '✅ Ativar')
          .setStyle(novoStatus ? ButtonStyle.Danger : ButtonStyle.Success),
      );

      await interaction.editReply({ embeds: [embedAtualizado], components: [rowAcoes] });
    } catch (err) {
      await interaction.followUp({ content: `❌ Erro: ${err.message}`, ephemeral: true });
    }
  }
}

// ── Handler de modal ──────────────────────────────────────
async function handleModal(interaction) {
  const id        = interaction.customId;
  const nome      = interaction.fields.getTextInputValue('nome').trim();
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  const precoStr  = interaction.fields.getTextInputValue('preco').replace(',', '.').trim();
  const imagem    = interaction.fields.getTextInputValue('imagem').trim() || null;
  const preco     = parseFloat(precoStr);

  if (isNaN(preco) || preco <= 0) {
    return interaction.reply({ content: '❌ Preço inválido! Use o formato: `29.90`', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_produto_novo') {
      await db.createProduct({ nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoCriado(
        { name: nome, description: descricao, price: preco },
        interaction.user.tag
      ));
      await interaction.editReply({ content: `✅ Produto **${nome}** criado por ${formatarValor(preco)}!\n\nUse \`/produtos\` para ver a lista atualizada.` });
    }

    if (id.startsWith('modal_produto_editar_')) {
      const produtoId = id.replace('modal_produto_editar_', '');
      await db.updateProduct(produtoId, { nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoEditado(
        { name: nome, price: preco },
        interaction.user.tag
      ));
      await interaction.editReply({ content: `✅ Produto **${nome}** atualizado!\n\nUse \`/produtos\` para ver a lista atualizada.` });
    }
  } catch (err) {
    console.error('[modal_produto]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

// ── Constrói modal de criar/editar ────────────────────────
function buildModal(tipo, produto = null) {
  const modal = new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_produto_novo' : `modal_produto_editar_${produto.id}`)
    .setTitle(tipo === 'novo' ? '➕ Novo Produto' : `✏️ Editar: ${produto.name.substring(0, 20)}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nome')
        .setLabel('Nome do produto')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setValue(produto?.name || '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('descricao')
        .setLabel('Descrição')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setValue(produto?.description || '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Preço (ex: 29.90)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10)
        .setValue(produto ? String(produto.price) : '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('imagem')
        .setLabel('URL da imagem (opcional)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(500)
        .setValue(produto?.image_url || '')
        .setRequired(false)
    ),
  );

  return modal;
}

module.exports = { data, execute, handleButton, handleModal };
