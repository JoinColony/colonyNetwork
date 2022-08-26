import ConsoleAdapter from "./console";

const Slack = require("slack");

class SlackAdapter extends ConsoleAdapter {
  constructor(label) {
    super(label);
    const token = process.env.SLACK_BOT_TOKEN;

    if (!token || !process.env.SLACK_CHANNEL) {
      console.log("You need to provide both SLACK_CHANNEL and SLACK_BOT_TOKEN env variables to use the slack adapter");
      process.exit(1);
    }

    this.bot = new Slack({ token });
  }

  async error(output) {
    await super.error(output);
    await this.bot.chat.postMessage({ channel: process.env.SLACK_CHANNEL, text: `${this.label}${output}` });
  }
}

export default SlackAdapter;
