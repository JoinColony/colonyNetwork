const t = require("../test/truffle-fixture");

async function main() {
  await t();
}

main().then(() => process.exit(0));
