const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { isStaff } = require("../utils");
const { sendBuyAdPanel } = require("../tickets");

module.exports = {
  path: ["buy", "ad"],
  data: new SlashCommandBuilder()
    .setName("ad")
    .setDescription("Send the buy ad panel")
    .addChannelOption(o => o.setName("channel").setDescription("Channel (default: here)").addChannelTypes(ChannelType.GuildText).setRequired(false)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: "No permission.", ephemeral: true });
    }

    const target = interaction.options.getChannel("channel") || interaction.channel;
    await sendBuyAdPanel(target);
    return interaction.reply({ content: `✅ Buy ad panel sent in ${target}.`, ephemeral: true });
  }
};
