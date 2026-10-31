const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { isAdmin } = require("../utils");
const { sendIGNPanel } = require("../ign");

module.exports = {
  path: ["ign", "link"],
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Send the IGN panel")
    .addChannelOption(o =>
      o.setName("channel")
        .setDescription("Channel (default: here)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "No permission.", ephemeral: true });
    }

    const target = interaction.options.getChannel("channel") || interaction.channel;
    await sendIGNPanel(target);
    return interaction.reply({ content: `Panel sent in ${target}.`, ephemeral: true });
  }
};
