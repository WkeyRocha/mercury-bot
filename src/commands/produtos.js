const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
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

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const produtos = await db.getAllProducts();

    const embed = new EmbedBuilder()
      .setColor(CORES.primaria)
      .setTitle('📦 Gerenciar Produtos')
      .setDescription(
        produtos.length
          ? produtos.map((p, i) => `${i + 1}. ${p.active ? '✅' : '❌'} **${p.name}** — ${formatarValor(p.price)}`).join('\n')
          : '_Nenhum produto cadastrado._'
      )
      .setFooter({ text: `${produtos.length} produto(s) • ✅ ativo • ❌ inativo` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('produto_novo')
          .setLabel('➕ Novo Produto')
          .setStyle(ButtonStyle.Success),
      ),
    ];

    if (produtos.length) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('produto_editar_sel')
            .setPlaceholder('✏️ Selecione um produto para editar...')
            .addOptions(produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: `${formatarValor(p.price)} • ${p.active ? 'Ativo' : 'Inativo'}`,
              value: p.id,
            })))
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('produto_toggle_sel')
            .setPlaceholder('🔄 Ativar / Desativar produto...')
            .addOptions(produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: p.active ? 'Clique para DESATIVAR' : 'Clique para ATIVAR',
              value: p.id,
              emoji: p.active ? '✅' : '❌',
            })))
        ),
      );
    }

    await interaction.editReply({ embeds: [embed], components });

  } catch (err) {
    console.error('[/produtos]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'produto_novo') {
    return interaction.showModal(buildModal('novo'));
  }

  if (id.startsWith('produto_editar_')) {
    const produtoId = id.replace('produto_editar_', '');
    const produto   = await db.getProductById(produtoId);
    return interaction.showModal(buildModal('editar', produto));
  }
}

async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  if (id === 'produto_editar_sel') {
    const produtoId = interaction.values[0];
    const produto   = await db.getProductById(produtoId);
    return interaction.showModal(buildModal('editar', produto));
  }

  if (id === 'produto_toggle_sel') {
    await interaction.deferUpdate();
    const produtoId = interaction.values[0];
    const produto   = await db.getProductById(produtoId);
    await db.toggleProduto(produtoId, !produto.active);
    const status = !produto.active ? '✅ ativado' : '❌ desativado';
    await interaction.followUp({ content: `Produto **${produto.name}** foi ${status}!`, ephemeral: true });
  }
}

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
      const produto = await db.createProduct({ nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoCriado({ name: nome, description: descricao, price: preco }, interaction.user.tag));
      await interaction.editReply({ content: `✅ Produto **${nome}** criado por ${formatarValor(preco)}!` });
    }

    if (id.startsWith('modal_produto_editar_')) {
      const produtoId = id.replace('modal_produto_editar_', '');
      await db.updateProduct(produtoId, { nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoEditado({ name: nome, price: preco }, interaction.user.tag));
      await interaction.editReply({ content: `✅ Produto **${nome}** atualizado!` });
    }
  } catch (err) {
    console.error('[modal_produto]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

function buildModal(tipo, produto = null) {
  const modal = new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_produto_novo' : `modal_produto_editar_${produto.id}`)
    .setTitle(tipo === 'novo' ? '➕ Novo Produto' : '✏️ Editar Produto');

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
        .setValue(produto?.image_url || '')
        .setRequired(false)
    ),
  );

  return modal;
}

module.exports = { data, execute, handleButton, handleSelectMenu, handleModal };
