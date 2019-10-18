const token = process.env.SLACK_BOT_TOKEN;

if (!token || !process.env.SLACK_CHANNEL) {
	console.log("You need to provide both SLACK_CHANNEL and SLACK_BOT_TOKEN env variables to use the slack adapter");
	process.exit(1)
}

const Slack = require('slack');

const bot = new Slack({token})

const SlackAdapter = {
  async log(output) {
    console.log(output);
  },

  async error(output){
  	await bot.chat.postMessage({channel: process.env.SLACK_CHANNEL, text: output})
  }
}

export default SlackAdapter