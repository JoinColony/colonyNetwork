class ConsoleAdapter {
  constructor(label) {
    if (label) {
      this.label = `${label}: `;
    } else {
      this.label = "";
    }
  }

  async log(output) {
    console.log(this.label, output);
  }

  async error(output) {
    console.log(this.label, output);
  }
}

module.exports = ConsoleAdapter;
