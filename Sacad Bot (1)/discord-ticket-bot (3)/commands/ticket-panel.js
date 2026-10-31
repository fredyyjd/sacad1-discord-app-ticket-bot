const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { isStaff } = require("../utils");
const { sendTicketPanel } = require("../tickets");

module.exports = {
  path: ["ticket", "panel"],
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send the ticket panel")
    .addChannelOption(o => o.setName("channel").setDescription("Channel (default: here)").addChannelTypes(ChannelType.GuildText).setRequired(false)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: "No permission.", ephemeral: true });
    }

    const target = interaction.options.getChannel("channel") || interaction.channel;
    await sendTicketPanel(target);
    return interaction.reply({ content: `✅ Ticket panel sent in ${target}.`, ephemeral: true });
  }
};
