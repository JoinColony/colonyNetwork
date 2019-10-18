 const ConsoleAdapter = {
  async log(output) {
    console.log(output);
  },

  async error(output){
    console.log(output);
  }
}

export default ConsoleAdapter;