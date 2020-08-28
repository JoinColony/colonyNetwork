const Discord = require('discord.js');

const client = new Discord.Client();
let channel;
client.once('ready', async () => {
	channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
});

client.login(process.env.DISCORD_BOT_TOKEN);

const DiscordAdapter = {
  async log(output) {
        console.log(output);
  	// channel.send(output);
  },

  async error(output){
  	channel.send(output);
  }
}

export default DiscordAdapter
