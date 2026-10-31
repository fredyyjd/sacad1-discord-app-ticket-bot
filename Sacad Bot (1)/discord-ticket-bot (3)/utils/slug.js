// Turns text into a channel-name-safe chunk: lowercase, letters/numbers/-/_
// only, no spaces. "100m 20 each" -> "100m20each", "Sacad1" -> "sacad1".
function slug(text, max = 40) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, max);
}

// Giveaway ticket name: host first, then the prize. e.g. "sacad1-100m20each".
function giveawayTicketName(host, prize, fallback) {
  const name = [slug(host, 30), slug(prize, 50)].filter(Boolean).join("-");
  return (name || fallback || "giveaway").slice(0, 90);
}

module.exports = { slug, giveawayTicketName };
