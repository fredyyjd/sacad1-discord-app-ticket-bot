const config = require("../config");

// Words that commonly show up in a giveaway-bot "winner" announcement.
// Used as a soft signal alongside the amount match, not a hard requirement.
const WINNER_WORDS = ["congratulations", "congrats", "winner", "winners", "won", "giveaway"];

// Words in a prize that say nothing useful when looking for it in text.
const FILLER_WORDS = new Set([
  "each", "the", "and", "for", "with", "per", "total", "from", "have", "this",
  "that", "your", "you", "all", "any", "won", "win", "got", "cash", "money", "ign"
]);

const UNIT_MULTIPLIERS = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mil: 1e6, mill: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bil: 1e9, bill: 1e9, billion: 1e9, billions: 1e9
};

// Finds every amount in a piece of text, however it was typed:
// "20m", "20 m", "20M", "20 million", "20mil", "$20,000,000", "1.5b", "50k".
// A bare number written after a suffixed one inherits that suffix, so
// "100m 20 each" reads as 100m and 20m. Returns plain numbers.
function parseAmounts(text) {
  if (!text) return [];

  const cleaned = String(text).toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");
  const regex = /(\d+(?:\.\d+)?)\s*(billions?|bill?|b|millions?|mill?|mil|m|thousand|k)?(?![a-z0-9])/g;

  const found = [];
  for (const match of cleaned.matchAll(regex)) {
    const value = parseFloat(match[1]);
    if (Number.isNaN(value)) continue;
    found.push({ value, unit: match[2] ? UNIT_MULTIPLIERS[match[2]] : null });
  }

  const lastUnit = [...found].reverse().find(f => f.unit)?.unit;
  const amounts = found.map(f => {
    if (f.unit) return f.value * f.unit;
    // Bare number (like the 20 in "100m 20 each"): borrow the suffix.
    return lastUnit && f.value < 1000 ? f.value * lastUnit : f.value;
  });

  return [...new Set(amounts.map(a => Math.round(a * 100) / 100))];
}

// Kept for the "type the amount in the ticket" follow-up: true if the text
// has anything that reads like an amount.
function parseAmount(text) {
  const amounts = parseAmounts(text);
  return amounts.length ? amounts[0] : null;
}

// Words worth looking for in the winning message (e.g. "spawners").
function prizeKeywords(text) {
  return [...new Set(
    String(text || "").toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !FILLER_WORDS.has(w) && !UNIT_MULTIPLIERS[w])
  )];
}

// All readable text on a message (content + embeds) in one string.
function messageText(message) {
  const parts = [];
  if (message.content) parts.push(message.content);

  for (const embed of message.embeds || []) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    for (const field of embed.fields || []) {
      if (field.name) parts.push(field.name);
      if (field.value) parts.push(field.value);
    }
    if (embed.footer?.text) parts.push(embed.footer.text);
  }

  return parts.join("\n");
}

function mentionsUser(text, userId) {
  return text.includes(`<@${userId}>`) || text.includes(`<@!${userId}>`) || text.includes(userId);
}

// Scans the configured giveaway channels for a message that mentions the
// ticket opener AND reads like the prize they typed. The prize doesn't have
// to be written the same way ("20m" = "20 m" = "20 million"). Host name and
// other prize words only help pick the best match.
// Returns { configured, found, message } where message is
// { url, channelId, messageId, createdTimestamp }.
async function findGiveawayWin(guild, ownerId, prizeText, hostText = "") {
  const gwConfig = config.giveawayCheck || {};
  const channelIds = (gwConfig.channels || []).filter(id => id && !id.startsWith("GIVEAWAY_CHANNEL_ID"));
  const botId = gwConfig.botId && !gwConfig.botId.startsWith("GIVEAWAY_BOT_") ? gwConfig.botId : null;

  if (!channelIds.length) {
    return { configured: false, found: false, message: null };
  }

  const wantedAmounts = parseAmounts(prizeText);
  const keywords = prizeKeywords(prizeText);
  const host = String(hostText || "").trim().toLowerCase();

  // Nothing to compare against (no amount and no usable words).
  if (!wantedAmounts.length && !keywords.length) {
    return { configured: true, found: false, message: null };
  }

  const limit = Math.max(50, Math.min(Number(gwConfig.searchLimit || 500), 5000));
  const matches = [];

  for (const channelId of channelIds) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) continue;

    let before;
    let scanned = 0;

    while (scanned < limit) {
      const batchSize = Math.min(100, limit - scanned);
      const options = { limit: batchSize, ...(before ? { before } : {}) };

      const batch = await channel.messages.fetch(options).catch(() => null);
      if (!batch || !batch.size) break;

      scanned += batch.size;

      for (const message of batch.values()) {
        if (botId && message.author.id !== botId) continue;

        const text = messageText(message);
        if (!text || !mentionsUser(text, ownerId)) continue;

        const lower = text.toLowerCase();
        const amountHits = wantedAmounts.length
          ? parseAmounts(text).filter(a => wantedAmounts.includes(a)).length
          : 0;
        const keywordHits = keywords.filter(w => lower.includes(w)).length;

        // Needs the amount to read the same, or (for prizes with no amount)
        // at least one of the prize words.
        if (wantedAmounts.length ? amountHits === 0 : keywordHits === 0) continue;

        const score =
          amountHits * 10 +
          keywordHits * 2 +
          (host && lower.includes(host) ? 5 : 0) +
          (WINNER_WORDS.some(word => lower.includes(word)) ? 3 : 0);

        matches.push({
          url: message.url,
          channelId: channel.id,
          messageId: message.id,
          createdTimestamp: message.createdTimestamp,
          score
        });
      }

      const oldest = batch.last();
      if (!oldest || batch.size < batchSize) break;
      before = oldest.id;
    }
  }

  if (!matches.length) {
    return { configured: true, found: false, message: null };
  }

  // Best score first, then the most recent.
  matches.sort((a, b) => b.score - a.score || b.createdTimestamp - a.createdTimestamp);
  return { configured: true, found: true, message: matches[0] };
}

// The "Claim Check" field text. Found shows when it was won, where, and a
// jump link. Not found just says so.
function claimCheckText(result) {
  if (result.configured && result.found) {
    const m = result.message;
    return [
      "✅ **They won a giveaway**",
      `Won: <t:${Math.floor(m.createdTimestamp / 1000)}:R>`,
      `Channel: <#${m.channelId}>`,
      `[Jump to winning message](${m.url})`
    ].join("\n");
  }
  return "❌ **Not found**";
}

module.exports = {
  parseAmount,
  parseAmounts,
  findGiveawayWin,
  claimCheckText
};
