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
} = require('discord.js');
const db = require('../database/supabase');
const { formatarValor } = require('../utils/pix');
const { CORES } = require('../utils/embeds');
const { enviarLog, msgProdutoCriado, msgProdutoEditado } = require('../utils/logs');

const data = new SlashCommandBuilder()
  .setName('produtos')
  .setDescription('[ADMIN] Gerenciar produtos e cupons da loja')
  .setDefaultMemberPermissions(0);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const [produtos, cupons] = await Promise.all([
      db.getAllProducts(),
      db.getCoupons(),
    ]);

    const listaProdutos = produtos.length
      ? produtos.map((p, i) => `${i + 1}. ${p.active ? 'Ativo' : 'Inativo'} **${p.name}** - ${formatarValor(p.price)}`).join('\n')
      : '_Nenhum produto cadastrado._';

    const listaCupons = cupons.length
      ? cupons.map((c, i) => {
          const desconto = c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : formatarValor(c.discount_value);
          return `${i + 1}. ${c.active ? 'Ativo' : 'Inativo'} **${c.code}** - ${desconto}`;
        }).join('\n')
      : '_Nenhum cupom cadastrado._';

    const embed = new EmbedBuilder()
      .setColor(CORES.primaria)
      .setTitle('Gerenciar Produtos')
      .setDescription(listaProdutos)
      .addFields({ name: 'Cupons', value: listaCupons, inline: false })
      .setFooter({ text: `${produtos.length} produto(s) | ${cupons.length} cupom(ns)` })
      .setTimestamp();

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('produto_novo')
          .setLabel('Novo Produto')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cupom_novo')
          .setLabel('Novo Cupom')
          .setStyle(ButtonStyle.Primary),
      ),
    ];

    if (produtos.length) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('produto_editar_sel')
            .setPlaceholder('Selecione um produto para editar...')
            .addOptions(produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: `${formatarValor(p.price)} - ${p.active ? 'Ativo' : 'Inativo'}`,
              value: p.id,
            })))
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('produto_toggle_sel')
            .setPlaceholder('Ativar / Desativar produto...')
            .addOptions(produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: p.active ? 'Clique para DESATIVAR' : 'Clique para ATIVAR',
              value: p.id,
            })))
        ),
      );
    }

    if (cupons.length) {
      components.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cupom_editar_sel')
            .setPlaceholder('Selecione um cupom para editar...')
            .addOptions(cupons.slice(0, 25).map(c => ({
              label: c.code.substring(0, 100),
              description: `${c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : formatarValor(c.discount_value)} - ${c.active ? 'Ativo' : 'Inativo'}`,
              value: c.id,
            })))
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cupom_toggle_sel')
            .setPlaceholder('Ativar / Desativar cupom...')
            .addOptions(cupons.slice(0, 25).map(c => ({
              label: c.code.substring(0, 100),
              description: c.active ? 'Clique para DESATIVAR' : 'Clique para ATIVAR',
              value: c.id,
            })))
        ),
      );
    }

    await interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    console.error('[/produtos]', err);
    if (err.message.includes("public.coupons") || err.message.includes("table 'coupons'") || err.message.includes('coupons')) {
      return interaction.editReply({
        content: 'A tabela de cupons ainda nao existe no Supabase. Execute o arquivo `instalar-cupons.sql` no SQL Editor do Supabase e tente `/produtos` novamente.',
      });
    }
    return interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'produto_novo') {
    return interaction.showModal(buildProductModal('novo'));
  }

  if (id === 'cupom_novo') {
    return interaction.showModal(buildCouponModal('novo'));
  }

  if (id.startsWith('produto_editar_')) {
    const produtoId = id.replace('produto_editar_', '');
    const produto = await db.getProductById(produtoId);
    return interaction.showModal(buildProductModal('editar', produto));
  }
}

async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  if (id === 'produto_editar_sel') {
    const produtoId = interaction.values[0];
    const produto = await db.getProductById(produtoId);
    return interaction.showModal(buildProductModal('editar', produto));
  }

  if (id === 'produto_toggle_sel') {
    await interaction.deferUpdate();
    const produtoId = interaction.values[0];
    const produto = await db.getProductById(produtoId);
    await db.toggleProduto(produtoId, !produto.active);
    const status = !produto.active ? 'ativado' : 'desativado';
    return interaction.followUp({ content: `Produto **${produto.name}** foi ${status}!`, ephemeral: true });
  }

  if (id === 'cupom_editar_sel') {
    const cupomId = interaction.values[0];
    const cupom = await db.getCouponById(cupomId);
    return interaction.showModal(buildCouponModal('editar', cupom));
  }

  if (id === 'cupom_toggle_sel') {
    await interaction.deferUpdate();
    const cupomId = interaction.values[0];
    const cupom = await db.getCouponById(cupomId);
    await db.toggleCoupon(cupomId, !cupom.active);
    const status = !cupom.active ? 'ativado' : 'desativado';
    return interaction.followUp({ content: `Cupom **${cupom.code}** foi ${status}!`, ephemeral: true });
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'modal_produto_novo' || id.startsWith('modal_produto_editar_')) {
    return handleProductModal(interaction);
  }

  if (id === 'modal_cupom_novo' || id.startsWith('modal_cupom_editar_')) {
    return handleCouponModal(interaction);
  }
}

async function handleProductModal(interaction) {
  const id = interaction.customId;
  const nome = interaction.fields.getTextInputValue('nome').trim();
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  const precoStr = interaction.fields.getTextInputValue('preco').replace(',', '.').trim();
  const imagem = interaction.fields.getTextInputValue('imagem').trim() || null;
  const preco = parseFloat(precoStr);

  if (isNaN(preco) || preco <= 0) {
    return interaction.reply({ content: 'Preco invalido! Use o formato: `29.90`', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_produto_novo') {
      await db.createProduct({ nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoCriado({ name: nome, description: descricao, price: preco }, interaction.user.tag));
      return interaction.editReply({ content: `Produto **${nome}** criado por ${formatarValor(preco)}!` });
    }

    if (id.startsWith('modal_produto_editar_')) {
      const produtoId = id.replace('modal_produto_editar_', '');
      await db.updateProduct(produtoId, { nome, descricao, preco, imagem });
      await enviarLog(interaction.client, msgProdutoEditado({ name: nome, price: preco }, interaction.user.tag));
      return interaction.editReply({ content: `Produto **${nome}** atualizado!` });
    }
  } catch (err) {
    console.error('[modal_produto]', err);
    return interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

async function handleCouponModal(interaction) {
  const id = interaction.customId;
  const codigo = db.normalizeCouponCode(interaction.fields.getTextInputValue('codigo'));
  const tipo = interaction.fields.getTextInputValue('tipo').trim().toLowerCase();
  const valorStr = interaction.fields.getTextInputValue('valor').replace(',', '.').trim();
  const ativoStr = interaction.fields.getTextInputValue('ativo').trim().toLowerCase() || 'sim';
  const valor = parseFloat(valorStr);
  const active = !['nao', 'n', 'false', '0', 'inativo'].includes(ativoStr);

  if (!/^[A-Z0-9_-]{3,32}$/.test(codigo)) {
    return interaction.reply({ content: 'Codigo invalido. Use 3 a 32 caracteres: letras, numeros, _ ou -.', ephemeral: true });
  }

  if (!['percent', 'fixo'].includes(tipo)) {
    return interaction.reply({ content: 'Tipo invalido. Use `percent` ou `fixo`.', ephemeral: true });
  }

  if (isNaN(valor) || valor <= 0 || (tipo === 'percent' && valor > 100)) {
    return interaction.reply({ content: 'Valor invalido. Percentual deve ser entre 1 e 100; fixo deve ser maior que zero.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_cupom_novo') {
      await db.createCoupon({ codigo, tipo, valor, active });
      return interaction.editReply({ content: `Cupom **${codigo}** criado!` });
    }

    if (id.startsWith('modal_cupom_editar_')) {
      const cupomId = id.replace('modal_cupom_editar_', '');
      await db.updateCoupon(cupomId, { codigo, tipo, valor, active });
      return interaction.editReply({ content: `Cupom **${codigo}** atualizado!` });
    }
  } catch (err) {
    console.error('[modal_cupom]', err);
    return interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

function buildProductModal(tipo, produto = null) {
  const modal = new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_produto_novo' : `modal_produto_editar_${produto.id}`)
    .setTitle(tipo === 'novo' ? 'Novo Produto' : 'Editar Produto');

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
        .setLabel('Descricao')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(500)
        .setValue(produto?.description || '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('preco')
        .setLabel('Preco (ex: 29.90)')
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

function buildCouponModal(tipo, cupom = null) {
  const modal = new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_cupom_novo' : `modal_cupom_editar_${cupom.id}`)
    .setTitle(tipo === 'novo' ? 'Novo Cupom' : 'Editar Cupom');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('codigo')
        .setLabel('Codigo do cupom')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(32)
        .setValue(cupom?.code || '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('tipo')
        .setLabel('Tipo: percent ou fixo')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(7)
        .setValue(cupom?.discount_type || 'percent')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('valor')
        .setLabel('Valor do desconto')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(10)
        .setValue(cupom ? String(cupom.discount_value) : '')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ativo')
        .setLabel('Ativo? sim ou nao')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(5)
        .setValue(cupom?.active === false ? 'nao' : 'sim')
        .setRequired(false)
    ),
  );

  return modal;
}

module.exports = { data, execute, handleButton, handleSelectMenu, handleModal };

