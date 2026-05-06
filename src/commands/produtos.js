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
  .setDescription('[ADMIN] Gerenciar produtos, categorias e cupons da loja')
  .setDefaultMemberPermissions(0);

// ── Helpers de construção do painel ──────────────────────

async function fetchProdutosData() {
  const [produtos, categorias, cupons] = await Promise.all([
    db.getAllProducts(),
    db.getCategories().catch(() => []),
    db.getCoupons().catch(() => []),
  ]);
  return { produtos, categorias, cupons };
}

function buildProdutosEmbed(produtos, categorias, cupons) {
  const listaProdutos = produtos.length
    ? produtos
        .map((p, i) => {
          const cat = p.category_name || 'Sem categoria';
          const status = p.active ? '🟢' : '🔴';
          return `${i + 1}. ${status} **${p.name}** — ${formatarValor(p.price)} | ${cat}`;
        })
        .join('\n')
        .substring(0, 2048)
    : '_Nenhum produto cadastrado._';

  const listaCategorias = categorias.length
    ? categorias
        .map((c, i) => `${i + 1}. ${c.active ? '🟢' : '🔴'} **${c.name}** — ordem ${c.sort_order || 0}`)
        .join('\n')
        .substring(0, 1024)
    : '_Nenhuma categoria cadastrada._';

  const listaCupons = cupons.length
    ? cupons
        .map((c, i) => {
          const desconto =
            c.discount_type === 'percent'
              ? `${Number(c.discount_value)}%`
              : formatarValor(c.discount_value);
          return `${i + 1}. ${c.active ? '🟢' : '🔴'} **${c.code}** — ${desconto}`;
        })
        .join('\n')
        .substring(0, 1024)
    : '_Nenhum cupom cadastrado._';

  return new EmbedBuilder()
    .setColor(CORES.primaria)
    .setTitle('⚙️ Gerenciar Produtos')
    .setDescription(listaProdutos)
    .addFields(
      { name: '🗂️ Categorias', value: listaCategorias, inline: false },
      { name: '🎟️ Cupons', value: listaCupons, inline: false },
    )
    .setFooter({
      text: `${produtos.length} produto(s) | ${categorias.length} categoria(s) | ${cupons.length} cupom(ns) — Painel atualizado`,
    })
    .setTimestamp();
}

function buildProdutosComponents(produtos, categorias, cupons) {
  // Discord permite no máximo 5 ActionRows por mensagem.
  // Distribuição:
  //   Row 1 — Botões de criação (sempre presente)
  //   Row 2 — Editar produto (se houver produtos)
  //   Row 3 — Ativar/Desativar produto (se houver produtos)
  //   Row 4 — Editar categoria (se houver categorias e espaço)
  //   Row 5 — Editar cupom (se houver cupons e espaço)
  // Obs.: Para ativar/desativar categorias e cupons use o campo "ativo" no modal de edição.

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('produto_novo')
        .setLabel('➕ Novo Produto')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cupom_novo')
        .setLabel('🎟️ Novo Cupom')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('categoria_nova')
        .setLabel('🗂️ Nova Categoria')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (produtos.length) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('produto_editar_sel')
          .setPlaceholder('✏️ Selecione um produto para editar...')
          .addOptions(
            produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: `${p.category_name || 'Sem categoria'} — ${formatarValor(p.price)} — ${p.active ? 'Ativo' : 'Inativo'}`.substring(0, 100),
              value: p.id,
            })),
          ),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('produto_toggle_sel')
          .setPlaceholder('🔄 Ativar / Desativar produto...')
          .addOptions(
            produtos.slice(0, 25).map(p => ({
              label: p.name.substring(0, 100),
              description: p.active
                ? '🟢 Ativo → clique para DESATIVAR'
                : '🔴 Inativo → clique para ATIVAR',
              value: p.id,
            })),
          ),
      ),
    );
  }

  if (categorias.length && components.length < 5) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('categoria_editar_sel')
          .setPlaceholder('✏️ Editar categoria (usa campo "ativo" p/ ativar/desativar)...')
          .addOptions(
            categorias.slice(0, 25).map(c => ({
              label: c.name.substring(0, 100),
              description: `${c.active ? '🟢 Ativa' : '🔴 Inativa'} — ordem ${c.sort_order || 0}`,
              value: c.id,
            })),
          ),
      ),
    );
  }

  if (cupons.length && components.length < 5) {
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('cupom_editar_sel')
          .setPlaceholder('✏️ Editar cupom (usa campo "ativo" p/ ativar/desativar)...')
          .addOptions(
            cupons.slice(0, 25).map(c => ({
              label: c.code.substring(0, 100),
              description: `${
                c.discount_type === 'percent'
                  ? `${Number(c.discount_value)}%`
                  : formatarValor(c.discount_value)
              } — ${c.active ? '🟢 Ativo' : '🔴 Inativo'}`,
              value: c.id,
            })),
          ),
      ),
    );
  }

  return components;
}

async function buildProdutosMessage() {
  const { produtos, categorias, cupons } = await fetchProdutosData();
  return {
    embeds: [buildProdutosEmbed(produtos, categorias, cupons)],
    components: buildProdutosComponents(produtos, categorias, cupons),
  };
}

// ── Comando /produtos ─────────────────────────────────────

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.editReply(await buildProdutosMessage());
  } catch (err) {
    console.error('[/produtos]', err);

    if (err.message.includes('coupons')) {
      return interaction.editReply({
        content:
          'A tabela de cupons ainda nao existe no Supabase. Execute `instalar-cupons.sql` no SQL Editor e tente novamente.',
      });
    }
    if (err.message.includes('categories')) {
      return interaction.editReply({
        content:
          'A tabela de categorias ainda nao existe no Supabase. Execute `instalar-categorias.sql` no SQL Editor e tente novamente.',
      });
    }
    return interaction.editReply({ content: `Erro: ${err.message}` });
  }
}

// ── Botões ────────────────────────────────────────────────

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'produto_novo') return interaction.showModal(buildProductModal('novo'));
  if (id === 'cupom_novo') return interaction.showModal(buildCouponModal('novo'));
  if (id === 'categoria_nova') return interaction.showModal(buildCategoryModal('novo'));

  if (id.startsWith('produto_editar_')) {
    const produtoId = id.replace('produto_editar_', '');
    const produto = await db.getProductById(produtoId);
    return interaction.showModal(buildProductModal('editar', produto));
  }
}

// ── Select menus ──────────────────────────────────────────

async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  // Editar produto → abre modal (não precisa defer aqui, showModal é instantâneo)
  if (id === 'produto_editar_sel') {
    const produto = await db.getProductById(interaction.values[0]);
    return interaction.showModal(buildProductModal('editar', produto));
  }

  // Toggle produto → atualiza painel imediatamente
  if (id === 'produto_toggle_sel') {
    await interaction.deferUpdate();
    try {
      const produto = await db.getProductById(interaction.values[0]);
      const novoStatus = !produto.active;
      await db.toggleProduto(produto.id, novoStatus);

      // Atualiza o painel com dados frescos
      await interaction.editReply(await buildProdutosMessage());

      await interaction.followUp({
        content: `✅ Produto **${produto.name}** foi ${novoStatus ? 'ativado' : 'desativado'}!`,
        ephemeral: true,
      });
    } catch (err) {
      console.error('[produto_toggle]', err);
      await interaction.followUp({ content: `❌ Erro: ${err.message}`, ephemeral: true });
    }
    return;
  }

  // Editar categoria → abre modal
  if (id === 'categoria_editar_sel') {
    const categoria = await db.getCategoryById(interaction.values[0]);
    return interaction.showModal(buildCategoryModal('editar', categoria));
  }

  // Editar cupom → abre modal
  if (id === 'cupom_editar_sel') {
    const cupom = await db.getCouponById(interaction.values[0]);
    return interaction.showModal(buildCouponModal('editar', cupom));
  }
}

// ── Modals ────────────────────────────────────────────────

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === 'modal_produto_novo' || id.startsWith('modal_produto_editar_')) {
    return handleProductModal(interaction);
  }
  if (id === 'modal_cupom_novo' || id.startsWith('modal_cupom_editar_')) {
    return handleCouponModal(interaction);
  }
  if (id === 'modal_categoria_nova' || id.startsWith('modal_categoria_editar_')) {
    return handleCategoryModal(interaction);
  }
}

async function handleProductModal(interaction) {
  const id = interaction.customId;
  const nome = interaction.fields.getTextInputValue('nome').trim();
  const descricao = interaction.fields.getTextInputValue('descricao').trim();
  const precoStr = interaction.fields.getTextInputValue('preco').replace(',', '.').trim();
  const imagem = interaction.fields.getTextInputValue('imagem').trim() || null;
  const categoria = interaction.fields.getTextInputValue('categoria').trim() || null;
  const preco = parseFloat(precoStr);

  if (isNaN(preco) || preco <= 0) {
    return interaction.reply({ content: '❌ Preco invalido! Use o formato: `29.90`', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_produto_novo') {
      const novo = await db.createProduct({ nome, descricao, preco, imagem, categoria });
      await enviarLog(
        interaction.client,
        msgProdutoCriado({ name: nome, description: descricao, price: preco }, interaction.user.tag),
      );
    } else {
      const produtoId = id.replace('modal_produto_editar_', '');
      await db.updateProduct(produtoId, { nome, descricao, preco, imagem, categoria });
      await enviarLog(
        interaction.client,
        msgProdutoEditado({ name: nome, price: preco }, interaction.user.tag),
      );
    }

    // Exibe painel atualizado como resposta
    await interaction.editReply(await buildProdutosMessage());
  } catch (err) {
    console.error('[modal_produto]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

async function handleCategoryModal(interaction) {
  const id = interaction.customId;
  const nome = interaction.fields.getTextInputValue('nome').trim();
  const descricao = interaction.fields.getTextInputValue('descricao').trim() || null;
  const ordemStr = interaction.fields.getTextInputValue('ordem').trim() || '0';
  const ativoStr = interaction.fields.getTextInputValue('ativo').trim().toLowerCase() || 'sim';
  const sortOrder = parseInt(ordemStr, 10);
  const active = !['nao', 'n', 'false', '0', 'inativa', 'inativo'].includes(ativoStr);

  if (!nome || nome.length > 80) {
    return interaction.reply({ content: '❌ Nome invalido. Use ate 80 caracteres.', ephemeral: true });
  }
  if (Number.isNaN(sortOrder)) {
    return interaction.reply({ content: '❌ Ordem invalida. Use um numero inteiro.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_categoria_nova') {
      await db.createCategory({ nome, descricao, active, sortOrder });
    } else {
      const categoriaId = id.replace('modal_categoria_editar_', '');
      await db.updateCategory(categoriaId, { nome, descricao, active, sortOrder });
    }

    await interaction.editReply(await buildProdutosMessage());
  } catch (err) {
    console.error('[modal_categoria]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
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
    return interaction.reply({
      content: '❌ Codigo invalido. Use 3 a 32 caracteres: letras, numeros, _ ou -.',
      ephemeral: true,
    });
  }
  if (!['percent', 'fixo'].includes(tipo)) {
    return interaction.reply({ content: '❌ Tipo invalido. Use `percent` ou `fixo`.', ephemeral: true });
  }
  if (isNaN(valor) || valor <= 0 || (tipo === 'percent' && valor > 100)) {
    return interaction.reply({
      content: '❌ Valor invalido. Percentual: 1–100. Fixo: maior que zero.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    if (id === 'modal_cupom_novo') {
      await db.createCoupon({ codigo, tipo, valor, active });
    } else {
      const cupomId = id.replace('modal_cupom_editar_', '');
      await db.updateCoupon(cupomId, { codigo, tipo, valor, active });
    }

    await interaction.editReply(await buildProdutosMessage());
  } catch (err) {
    console.error('[modal_cupom]', err);
    await interaction.editReply({ content: `❌ Erro: ${err.message}` });
  }
}

// ── Builders de modais ────────────────────────────────────

function buildProductModal(tipo, produto = null) {
  return new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_produto_novo' : `modal_produto_editar_${produto.id}`)
    .setTitle(tipo === 'novo' ? 'Novo Produto' : `Editar: ${produto.name.substring(0, 30)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nome')
          .setLabel('Nome do produto')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(produto?.name || '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descricao')
          .setLabel('Descricao')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setValue(produto?.description || '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('preco')
          .setLabel('Preco (ex: 29.90)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setValue(produto ? String(produto.price) : '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('imagem')
          .setLabel('URL da imagem (opcional)')
          .setStyle(TextInputStyle.Short)
          .setValue(produto?.image_url || '')
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('categoria')
          .setLabel('Categoria (opcional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setValue(produto?.category_name || '')
          .setRequired(false),
      ),
    );
}

function buildCategoryModal(tipo, categoria = null) {
  return new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_categoria_nova' : `modal_categoria_editar_${categoria.id}`)
    .setTitle(tipo === 'novo' ? 'Nova Categoria' : `Editar: ${categoria.name.substring(0, 30)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nome')
          .setLabel('Nome da categoria')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setValue(categoria?.name || '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descricao')
          .setLabel('Descricao (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setValue(categoria?.description || '')
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ordem')
          .setLabel('Ordem no catalogo (numero)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(6)
          .setValue(String(categoria?.sort_order ?? 0))
          .setRequired(false),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ativo')
          .setLabel('Ativa? sim ou nao')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setValue(categoria?.active === false ? 'nao' : 'sim')
          .setRequired(false),
      ),
    );
}

function buildCouponModal(tipo, cupom = null) {
  return new ModalBuilder()
    .setCustomId(tipo === 'novo' ? 'modal_cupom_novo' : `modal_cupom_editar_${cupom.id}`)
    .setTitle(tipo === 'novo' ? 'Novo Cupom' : `Editar: ${cupom.code.substring(0, 30)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('codigo')
          .setLabel('Codigo do cupom')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(32)
          .setValue(cupom?.code || '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('tipo')
          .setLabel('Tipo: percent ou fixo')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setValue(cupom?.discount_type || 'percent')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('valor')
          .setLabel('Valor do desconto')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setValue(cupom ? String(cupom.discount_value) : '')
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ativo')
          .setLabel('Ativo? sim ou nao')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5)
          .setValue(cupom?.active === false ? 'nao' : 'sim')
          .setRequired(false),
      ),
    );
}

module.exports = { data, execute, handleButton, handleSelectMenu, handleModal };
