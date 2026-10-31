const { SlashCommandBuilder } = require("discord.js");
const { buildLbMessage } = require("../lb");

// Public - anyone can use it, no staff role needed. Opens on Closes; the
// buttons (handled in index.js) switch to Claims / Renames / Sponsor.
module.exports = {
  path: ["staff", "lb"],
  data: new SlashCommandBuilder()
    .setName("lb")
    .setDescription("Staff leaderboard"),

  async execute(interaction) {
    return interaction.reply(buildLbMessage("closes"));
  }
};
