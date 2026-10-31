const { SlashCommandBuilder } = require("discord.js");
const { runRoleChange, PROMO_CHOICES } = require("../promoRoles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff-promote")
    .setDescription("Promote a staff member")
    .addUserOption(o => o.setName("user").setDescription("Who to promote").setRequired(true))
    .addStringOption(o => o
      .setName("role")
      .setDescription("New role")
      .setRequired(true)
      .addChoices(...PROMO_CHOICES)),

  async execute(interaction) {
    return runRoleChange(interaction, "promo");
  }
};
