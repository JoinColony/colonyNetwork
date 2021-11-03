import ConsoleAdapter from "./console";

const Discord = require("discord.js");

class DiscordAdapter extends ConsoleAdapter {
  constructor(label) {
    super(label);

    const client = new Discord.Client();
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

export default DiscordAdapter;
