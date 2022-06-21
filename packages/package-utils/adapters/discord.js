const Discord = require("discord.js");

const ConsoleAdapter = require("./console");

class DiscordAdapter extends ConsoleAdapter {
  constructor(label) {
    super(label);

    const usedIntents = new Discord.Intents();
    const client = new Discord.Client({ intents: usedIntents });

    client.once("ready", async () => {
      this.channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    });

    client.login(process.env.DISCORD_BOT_TOKEN);
  }

  async error(output) {
    super.error(output);
    this.channel.send(`${this.label}${output}`);
  }
}

module.exports = DiscordAdapter;
