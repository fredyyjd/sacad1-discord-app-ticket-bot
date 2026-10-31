const { SlashCommandBuilder } = require("discord.js");
const { runRoleChange, DEMO_CHOICES } = require("../builderRoles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("builder-demote")
    .setDescription("Demote a builder")
    .addUserOption(o => o.setName("user").setDescription("Who to demote").setRequired(true))
    .addStringOption(o => o
      .setName("role")
      .setDescription("New role")
      .setRequired(true)
      .addChoices(...DEMO_CHOICES)),

  async execute(interaction) {
    return runRoleChange(interaction, "demo");
  }
};
