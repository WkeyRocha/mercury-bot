const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database/supabase');
const { embedDashboard, embedErro } = require('../utils/embeds');

function isAdmin(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (process.env.ADMIN_ROLE_ID && member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return true;
  return false;
}

const data = new SlashCommandBuilder()
  .setName('dashboard')
  .setDescription('📊 [ADMIN] Resumo de vendas e pedidos')
  .setDefaultMemberPermissions(0);

async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [embedErro('🚫 Apenas administradores podem ver o dashboard.')],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = await db.getDashboardStats();

    const rowAtualizar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dashboard_atualizar')
        .setLabel('🔄 Atualizar')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      embeds: [embedDashboard(stats)],
      components: [rowAtualizar],
    });

  } catch (err) {
    console.error('[/dashboard]', err);
    await interaction.editReply({ embeds: [embedErro(`Erro ao carregar dashboard: ${err.message}`)] });
  }
}

async function handleButton(interaction) {
  if (interaction.customId !== 'dashboard_atualizar') return;
  if (!isAdmin(interaction.member)) return;

  await interaction.deferUpdate();

  try {
    const stats = await db.getDashboardStats();

    const rowAtualizar = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dashboard_atualizar')
        .setLabel('🔄 Atualizar')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      embeds: [embedDashboard(stats)],
      components: [rowAtualizar],
    });
  } catch (err) {
    console.error('[dashboard_btn]', err);
  }
}

module.exports = { data, execute, handleButton };
