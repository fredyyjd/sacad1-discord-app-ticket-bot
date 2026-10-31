// Loads every file in ./commands and builds what Discord needs.
//
// A normal command file exports { data, execute } and becomes /name.
// A command file can also export `path` to live under another command, so
// "ticket-rename" becomes "/ticket rename":
//   path: ["ticket", "rename"]            -> /ticket rename
//   path: ["service", "ticket", "panel"]  -> /service ticket panel
//   path: ["staff", "reset"], asGroup: true  -> /staff reset <its own subcommands>
// In those files `data` is a normal SlashCommandBuilder named after the LAST
// word of the path. index.js and deploy-commands.js both use this loader.
const fs = require("fs");
const path = require("path");

const PARENT_DESCRIPTIONS = {
  ticket: "Ticket tools",
  staff: "Staff tools",
  sponsor: "Sponsorships",
  application: "Applications",
  service: "Service tickets",
  buy: "Advertising",
  ign: "IGN tools",
  linked: "Linked IGNs",
  honey: "Honeypot",
  are: "Legit vote"
};

const GROUP_DESCRIPTIONS = {
  stream: "Stream pings",
  ticket: "Ticket tools",
  we: "Legit vote"
};

function loadCommands(dir) {
  const modules = new Map(); // "ticket rename" -> command module
  const tops = new Map();    // "ticket" -> raw command JSON
  const skipped = [];

  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
    const mod = require(path.resolve(dir, file));
    if (!mod?.data || !mod?.execute) {
      skipped.push(file);
      continue;
    }

    const json = mod.data.toJSON();

    if (!Array.isArray(mod.path) || mod.path.length < 2) {
      tops.set(json.name, json);
      modules.set(json.name, mod);
      continue;
    }

    const [parent, ...rest] = mod.path;
    const last = rest[rest.length - 1];
    if (!tops.has(parent)) {
      tops.set(parent, { name: parent, description: PARENT_DESCRIPTIONS[parent] || "Tools", options: [] });
    }
    const top = tops.get(parent);
    top.options = top.options || [];

    // The node this file becomes: a subcommand, or (asGroup) a group that
    // holds the file's own subcommands.
    const node = mod.asGroup
      ? { type: 2, name: last, description: json.description, options: json.options || [] }
      : { type: 1, name: last, description: json.description, options: json.options || [] };

    if (rest.length === 1) {
      top.options.push(node);
    } else {
      // /parent group sub — find or create the group.
      const groupName = rest[0];
      let group = top.options.find(o => o.type === 2 && o.name === groupName);
      if (!group) {
        group = { type: 2, name: groupName, description: GROUP_DESCRIPTIONS[groupName] || "Tools", options: [] };
        top.options.push(group);
      }
      group.options.push(node);
    }

    modules.set(mod.path.join(" "), mod);
  }

  return { modules, body: [...tops.values()], skipped };
}

// Finds the module that should handle a slash command interaction.
function resolveCommand(modules, interaction) {
  const name = interaction.commandName;
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;

  const keys = [
    [name, group, sub],
    [name, group],
    [name, sub],
    [name]
  ].map(parts => parts.filter(Boolean).join(" "));

  for (const key of keys) {
    if (modules.has(key)) return modules.get(key);
  }
  return null;
}

module.exports = { loadCommands, resolveCommand };
