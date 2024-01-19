/* global artifacts */

const deploy = require("./truffle-fixture");

const main = async () => {
  await deploy();
  const EtherRouter = artifacts.require("EtherRouter");
  const etherRouter = await EtherRouter.deployed();
  console.log(`EtherRouter deployed at ${etherRouter.address}`);

  process.exit();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
