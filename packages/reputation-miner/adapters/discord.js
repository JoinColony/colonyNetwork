const Discord = require('discord.js');

const client = new Discord.Client();
let channel;
client.once('ready', async () => {
	channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
});

client.login(process.env.DISCORD_BOT_TOKEN);

class DiscordAdapter {
  constructor (label){
    if (label){
      this.label = `${label}: `;
    } else {
      this.label = "";
    }
  }

  async log(output) {
    console.log(this.label, output);
  }

  async error(output){
    channel.send(`${this.label}${output}`);
    console.log(`${this.label}${output}`);
  }
}

export default DiscordAdapter
