const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags
} = require("discord.js");
const config = require("./config");
const { isStaff } = require("./utils");
const { BROWN } = require("./utils/colors");

// question "type" values:
//   text          -> plain text answer, collected from a DM message
//   select        -> answer chosen from a dropdown
//   images        -> 2-5 image attachments required
//   images_or_text-> image attachments OR a text answer (used for optional vouches)
const STAFF_QUESTIONS = [
  { key: "ign", type: "text", label: "What's your IGN (Minecraft username)?" },
  { key: "balance", type: "text", label: "What's your in-game balance?" },
  { key: "why", type: "text", label: "Why do you want to be staff on Sac's Service?" },
  { key: "howlong", type: "text", label: "How long have you been in this server?" },
  { key: "activity", type: "text", label: "How active can you be each week?" },
  { key: "pastexp", type: "text", label: "Do you have past staff experience? If so list them." },
  { key: "arguments", type: "text", label: "How would you deal with arguments or drama in chat?" },
  { key: "rulebreak", type: "text", label: "How would you handle someone breaking our rules?" },
  { key: "improve", type: "text", label: "What would you do to help improve the server?" },
  { key: "sponsor", type: "select", label: "Will you sponsor giveaways?", options: ["Yes", "No", "Possibly"] },
  { key: "agree", type: "select", label: "Do you agree that if any bad detail or spelling it will be denied?", options: ["Yes", "No"] }
];

const BUILDER_QUESTIONS = [
  { key: "info", type: "text", label: "What's your IGN, Balance, Age and Playtime?" },
  { key: "types", type: "text", label: "What types of bases can you build? (Maparts, stash bases, regear rooms, underground bases, mega bases, etc.)" },
  { key: "images", type: "images", min: 2, max: 5, label: "Upload 2-5 images of past bases you have built (In Donut, not Creative)." },
  { key: "vouches", type: "images_or_text", max: 5, label: "Do you have any vouches or images to upload?" },
  { key: "schematic", type: "select", label: "Have you ever built using a schematic/Litematica before?", options: ["Yes", "No", "Sometimes"] },
  { key: "customdesigns", type: "text", label: "Can you build custom designs or only follow schematics?" },
  { key: "timeframe", type: "text", label: "How long would a medium-sized base usually take you to complete?" },
  { key: "confidential", type: "text", label: "Are you able to delete homes, remove evidence and keep builds confidential after finishing the job?" },
  { key: "payment", type: "text", label: "Do you understand that all payments go through the owner till the build is complete and you will get paid at the end of every week?" },
  { key: "better", type: "text", label: "Why are you a better builder than others? (2 sentences)" }
];

const APPLICATION_TYPES = {
  staff: { label: "Staff Application", questions: STAFF_QUESTIONS },
  builder: { label: "Builder Application", questions: BUILDER_QUESTIONS }
};

// userId -> session
const sessions = new Map();

const MAX_ANSWER_LENGTH = 1500;

function fmtDate(ms) {
  const t = Math.floor(ms / 1000);
  return `<t:${t}:F>\n(<t:${t}:R>)`;
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function clip(text, max) {
  text = String(text ?? "");
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

// ---------------------------------------------------------------------
// DM side: the applicant answering questions
// ---------------------------------------------------------------------
function navRow(session) {
  const row = new ActionRowBuilder();
  if (session.index > 0) {
    row.addComponents(new ButtonBuilder().setCustomId("app_back").setLabel("Previous Question").setStyle(ButtonStyle.Secondary));
  }
  row.addComponents(new ButtonBuilder().setCustomId("app_cancel").setLabel("Cancel Application").setStyle(ButtonStyle.Danger));
  return row;
}

function clearSession(userId) {
  const s = sessions.get(userId);
  if (s && s.timer) clearTimeout(s.timer);
  sessions.delete(userId);
}

async function sendQuestion(user, session) {
  const q = session.questions[session.index];
  session.awaiting = q.type;
  const info = APPLICATION_TYPES[session.type];

  const embed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle(info.label)
    .setDescription(`**Question ${session.index + 1} of ${session.questions.length}**\n\n${q.label}`);

  if (q.type === "text") embed.setFooter({ text: "Type your answer and send it as a message." });
  if (q.type === "select") embed.setFooter({ text: "Pick your answer from the dropdown." });
  if (q.type === "images") embed.setFooter({ text: `Upload ${q.min} to ${q.max} images in a single message.` });
  if (q.type === "images_or_text") embed.setFooter({ text: "Reply with text, or upload images in a single message." });

  const components = [];
  if (q.type === "select") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("app_select")
      .setPlaceholder("Choose an answer")
      .addOptions(q.options.map(o => ({ label: o, value: o })));
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  components.push(navRow(session));

  await user.send({ embeds: [embed], components }).catch(() => {});
}

async function startApplication(user, type) {
  if (sessions.has(user.id)) return;

  const questions = APPLICATION_TYPES[type].questions;
  const session = {
    type,
    questions,
    index: 0,
    answers: {},
    appId: `${type}-${user.id}-${Date.now()}`,
    startedAt: Date.now(),
    awaiting: null,
    timer: setTimeout(() => expireApplication(user), config.applicationTimeLimitMs)
  };
  sessions.set(user.id, session);
  await sendQuestion(user, session);
}

async function expireApplication(user) {
  const session = sessions.get(user.id);
  if (!session) return;
  clearSession(user.id);
  const embed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle("Application Expired")
    .setDescription("You did not finish your application within the 3 hour time limit. Start a new application if you'd still like to apply.");
  await user.send({ embeds: [embed] }).catch(() => {});
}

async function cancelApplication(user) {
  clearSession(user.id);
  const embed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle("Application Cancelled")
    .setDescription("Your application was cancelled. You can start a new one at any time.");
  await user.send({ embeds: [embed] }).catch(() => {});
}

async function submitAnswer(user, session, value) {
  session.answers[session.questions[session.index].key] = value;
  session.index++;

  if (session.index >= session.questions.length) {
    await sendSummary(user, session);
  } else {
    await sendQuestion(user, session);
  }
}

// "Previous Question" button: step back one and answer it again.
async function goBack(user) {
  const session = sessions.get(user.id);
  if (!session) return false;

  if (session.awaiting === "confirm") {
    session.index = session.questions.length - 1;
  } else if (session.index > 0) {
    session.index--;
  } else {
    return false;
  }
  delete session.answers[session.questions[session.index].key];
  await sendQuestion(user, session);
  return true;
}

// Last step before sending: show everything back and ask for confirmation.
async function sendSummary(user, session) {
  session.awaiting = "confirm";
  const info = APPLICATION_TYPES[session.type];

  const blocks = session.questions.map((q, n) => {
    const a = session.answers[q.key];
    const text = Array.isArray(a) ? `${a.length} image(s) uploaded` : clip(a ?? "N/A", 180);
    return `**${n + 1}. ${q.label}**\n${text}`;
  });

  const embed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle(`Review Your ${info.label}`)
    .setDescription(clip(blocks.join("\n\n"), 4000))
    .setFooter({ text: "Press Submit to send it to the team, or go back to change your last answer." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("app_submit").setLabel("Submit Application").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("app_back").setLabel("Previous Question").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("app_cancel").setLabel("Cancel Application").setStyle(ButtonStyle.Danger)
  );
  await user.send({ embeds: [embed], components: [row] }).catch(() => {});
}

// "Submit Application" button.
async function confirmApplication(user) {
  const session = sessions.get(user.id);
  if (!session || session.awaiting !== "confirm") return false;
  clearTimeout(session.timer);
  sessions.delete(user.id);
  await finishApplication(user, session);
  return true;
}

// ---------------------------------------------------------------------
// Review side: what staff see in the review channel
// ---------------------------------------------------------------------
async function finishApplication(user, session) {
  const info = APPLICATION_TYPES[session.type];

  await user.send({
    embeds: [new EmbedBuilder()
      .setColor(BROWN)
      .setTitle("Application Submitted")
      .setDescription("Thanks. Your application has been sent to the team. You'll get a DM once it has been decided.")]
  }).catch(() => {});

  const client = user.client;
  const reviewChannel = await client.channels.fetch(config.applicationReviewChannels[session.type]).catch(() => null);
  if (!reviewChannel) return;

  const member = await reviewChannel.guild.members.fetch(user.id).catch(() => null);
  const topRole = member
    ? [...member.roles.cache.values()].filter(r => r.id !== reviewChannel.guild.id).sort((a, b) => b.position - a.position)[0]
    : null;

  // 1) Who applied
  const infoEmbed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle(info.label.toUpperCase())
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Applicant", value: `${user}`, inline: true },
      { name: "User ID", value: `\`${user.id}\``, inline: true },
      { name: "Username", value: user.username, inline: true },
      { name: "Display Name", value: member?.displayName || user.globalName || user.username, inline: true },
      { name: "Joined Discord", value: fmtDate(user.createdTimestamp), inline: true },
      { name: "Joined Server", value: member?.joinedTimestamp ? fmtDate(member.joinedTimestamp) : "Not in the server", inline: true },
      { name: "Top Role", value: topRole ? `${topRole}` : "None", inline: true },
      { name: "Roles", value: member ? String(Math.max(0, member.roles.cache.size - 1)) : "0", inline: true },
      { name: "Time To Complete", value: fmtDuration(Date.now() - session.startedAt), inline: true }
    )
    .setTimestamp();

  const pingRole = config.applicationPingRoles[session.type];
  await reviewChannel.send({
    content: pingRole ? `<@&${pingRole}>` : undefined,
    embeds: [infoEmbed],
    allowedMentions: { roles: pingRole ? [pingRole] : [] }
  }).catch(err => console.error("Failed to post application info:", err));

  // 2) Their answers, in order. Text answers are packed into as few
  // embeds as fit; each image question gets its own gallery message.
  const messages = [];
  let pending = [];
  let pendingLength = 0;
  let part = 0;

  const flushText = () => {
    if (!pending.length) return;
    const embed = new EmbedBuilder()
      .setColor(BROWN)
      .setDescription(pending.join("\n\n"));
    if (part === 0) embed.setTitle("Answers");
    else embed.setTitle("Answers (continued)");
    messages.push({ embeds: [embed] });
    part++;
    pending = [];
    pendingLength = 0;
  };

  session.questions.forEach((q, n) => {
    const answer = session.answers[q.key];
    const isImages = q.type === "images" || (q.type === "images_or_text" && Array.isArray(answer));

    if (isImages) {
      flushText();
      const urls = Array.isArray(answer) ? answer : [];
      const galleryUrl = `https://application.local/${session.appId}/${n}`;
      const head = new EmbedBuilder()
        .setColor(BROWN)
        .setURL(galleryUrl)
        .setTitle(`${n + 1}. ${clip(q.label, 240)}`)
        .setDescription(urls.length ? `${urls.length} image(s)` : "No images provided.");
      const imgs = urls.slice(0, 9).map(url => new EmbedBuilder().setURL(galleryUrl).setImage(url));
      messages.push({ embeds: [head, ...imgs] });
      return;
    }

    const block = `**${n + 1}. ${q.label}**\n${clip(answer ?? "N/A", 3000)}`;
    if (pendingLength + block.length > 3800) flushText();
    pending.push(block);
    pendingLength += block.length + 2;
  });
  flushText();

  for (const m of messages) {
    await reviewChannel.send(m).catch(err => console.error("Failed to post application answers:", err));
  }

  // 3) Decision message with the buttons, last so it sits under the answers.
  const decisionEmbed = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle("Decision")
    .setDescription(`${info.label} from ${user}\nStatus: Pending`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`appr_accept_${session.type}_${user.id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`appr_acceptwr_${session.type}_${user.id}`).setLabel("Accept With Reason").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`appr_deny_${session.type}_${user.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`appr_denywr_${session.type}_${user.id}`).setLabel("Deny With Reason").setStyle(ButtonStyle.Danger)
  );

  await reviewChannel.send({
    embeds: [decisionEmbed],
    components: [row],
    allowedMentions: { parse: [] }
  }).catch(err => console.error("Failed to post application decision:", err));
}

// Accept / Accept With Reason / Deny / Deny With Reason buttons.
// customId: appr_<action>_<type>_<applicantId>
async function handleReviewButton(i) {
  if (!isStaff(i.member)) return i.reply({ content: "No permission.", ephemeral: true });

  const [, action, type, applicantId] = i.customId.split("_");
  const info = APPLICATION_TYPES[type];
  if (!info || !applicantId) return i.reply({ content: "That application button is out of date.", ephemeral: true });

  if (action.endsWith("wr")) {
    const accepting = action.startsWith("accept");
    const modal = new ModalBuilder()
      .setCustomId(`appr_modal_${action}_${type}_${applicantId}`)
      .setTitle(accepting ? "Accept With Reason" : "Deny With Reason");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
    ));
    return i.showModal(modal);
  }

  return decide(i, action, type, applicantId, null);
}

// Reason popup submitted. customId: appr_modal_<action>_<type>_<applicantId>
async function handleReviewModal(i) {
  if (!isStaff(i.member)) return i.reply({ content: "No permission.", ephemeral: true });

  const [, , action, type, applicantId] = i.customId.split("_");
  if (!APPLICATION_TYPES[type] || !applicantId) return i.reply({ content: "That application is out of date.", ephemeral: true });

  const reason = i.fields.getTextInputValue("reason").trim();
  return decide(i, action.replace(/wr$/, ""), type, applicantId, reason);
}

async function decide(i, action, type, applicantId, reason) {
  const info = APPLICATION_TYPES[type];
  const accepted = action === "accept";

  let roleNote = null;
  if (accepted) {
    const roleId = config.approvedRoles[type];
    const member = await i.guild.members.fetch(applicantId).catch(() => null);
    if (!roleId) roleNote = "No role set for this application type";
    else if (!member) roleNote = "Applicant is not in the server, role not given";
    else {
      try {
        await member.roles.add(roleId);
        roleNote = `Given <@&${roleId}>`;
      } catch (err) {
        console.error(`Failed to add approved role to ${applicantId}:`, err);
        roleNote = "Could not give the role, check my permissions";
      }
    }
  }

  const fields = [
    { name: "Decision", value: accepted ? "Accepted" : "Denied", inline: true },
    { name: "Decided By", value: `${i.user}`, inline: true }
  ];
  if (reason) fields.push({ name: "Reason", value: reason });
  if (roleNote) fields.push({ name: "Role", value: roleNote });

  const base = i.message?.embeds?.[0] ? EmbedBuilder.from(i.message.embeds[0]) : new EmbedBuilder().setColor(BROWN).setTitle("Decision");
  base.setColor(BROWN)
    .setDescription(`${info.label} from <@${applicantId}>`)
    .setFields(fields)
    .setTimestamp();

  await i.update({ embeds: [base], components: [], allowedMentions: { parse: [] } });

  const applicant = await i.client.users.fetch(applicantId).catch(() => null);
  const dm = new EmbedBuilder()
    .setColor(BROWN)
    .setTitle(`${info.label} ${accepted ? "Accepted" : "Denied"}`)
    .setDescription(
      accepted
        ? `Congratulations! Your ${info.label.toLowerCase()} in ${i.guild.name} has been accepted.`
        : `Your ${info.label.toLowerCase()} in ${i.guild.name} has been denied.`
    );
  if (reason) dm.addFields({ name: "Reason", value: reason });

  const sent = applicant ? await applicant.send({ embeds: [dm] }).then(() => true).catch(() => false) : false;
  if (!sent) {
    await i.followUp({ content: "I couldn't DM the applicant (their DMs are closed or they aren't reachable).", ephemeral: true }).catch(() => {});
  }
}

// Built as a Components V2 container (instead of a plain embed) so the
// long requirements text can be split up with separators, and the
// "apply_type" dropdown lives inside the same container at the bottom.
function buildApplicationPanelContainer(menu) {
  return new ContainerBuilder()
    .setAccentColor(BROWN)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "# Staff & Builder Application\n" +
        "Sacad is looking for reliable and suited applicants to become a part of the staff team, but before applying for Staff or Builder, please make sure you meet the requirements below:"
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "- Must be 14+ years old\n" +
        "- Must be active in the server\n" +
        "- Must be respectful to all members & staff\n" +
        "- Must be mature and able to handle drama/problems\n" +
        "- Must know and follow all server rules\n" +
        "- Must put effort into your application (no 1 word answers)\n" +
        "- Must have money to buy/sell spawners if needed\n" +
        "- Must know basic server stuff (selling/buying skeleton spawners, support, etc.)\n" +
        "- Must not have recent punishments or warnings\n" +
        "- Must have screenshots of previous builds (builder only)\n" +
        "- Must not scam, grief, or abuse your power over others\n" +
        "- Must have experience building on DonutSMP (builders only)\n" +
        "- Must provide vouches from previous customers (screenshots or usernames - builders only)\n" +
        "- Must know how to use schematics/Litematica if required (builders only)\n" +
        "- Must keep customer bases confidential and delete homes when requested"
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "**Further notice:**\n" +
        "- Asking for staff lowers your chances\n" +
        "- DMing staff to check your application may result in denial\n" +
        "- Staff is chosen based on trust, activity, maturity & helpfulness\n" +
        "- Not everyone will be accepted"
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(menu)
    );
}

async function sendApplicationPanel(channel) {
  const options = [];
  if (config.applicationsEnabled.staff) options.push({ label: "Staff Applications", value: "staff",  });
  if (config.applicationsEnabled.builder) options.push({ label: "Builder Applications", value: "builder",  });
  if (!options.length) return false;
  const menu = new StringSelectMenuBuilder().setCustomId("apply_type").setPlaceholder("Select an application type").addOptions(options);
  await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [buildApplicationPanelContainer(menu)]
  });
  return true;
}

module.exports = {
  APPLICATION_TYPES,
  MAX_ANSWER_LENGTH,
  sessions,
  startApplication,
  cancelApplication,
  submitAnswer,
  goBack,
  confirmApplication,
  handleReviewButton,
  handleReviewModal,
  sendApplicationPanel
};
