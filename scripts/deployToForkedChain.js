/* global hre */
const stream = require("stream");
const path = require("path");
const { promisify } = require("util");

const { ethers } = require("hardhat");
const fs = require("fs");
const axios = require("axios");

const provider = new ethers.providers.StaticJsonRpcProvider("http://127.0.0.1:8545");

const { FORKED_NETWORK_ADDRESS, REPUTATION_URL } = process.env;

if (!FORKED_NETWORK_ADDRESS) {
  throw new Error("FORKED_NETWORK_ADDRESS must be set");
}

if (!REPUTATION_URL) {
  throw new Error("REPUTATION_URL must be set");
}

let signer;
async function getResolverAddress(etherRouterAddress) {
  const er = await ethers.getContractAt("EtherRouter", etherRouterAddress);
  return er.resolver();
}

async function setResolver(etherRouterAddress, resolverAddress) {
  const er = await ethers.getContractAt("EtherRouter", etherRouterAddress, signer);
  return er.setResolver(resolverAddress);
}

async function copyResolver(fromAddress, toAddress) {
  const fromResolver = await getResolverAddress(fromAddress);
  return setResolver(toAddress, fromResolver);
}

async function getMostRecentEvent(contract, _filter) {
  const filter = _filter;
  const latestBlockNumber = await provider.getBlockNumber();
  filter.fromBlock = latestBlockNumber + 1; // +1 to accommodate the first loop iteration
  filter.toBlock = filter.fromBlock;
  let foundEvent = false;
  let events;
  const BLOCK_PAGING_SIZE = 1000;
  while (filter.toBlock > 0 && !foundEvent) {
    // Create a span of events up to BLOCK_PAGING_SIZE in length
    filter.toBlock = filter.fromBlock - 1;
    filter.fromBlock = Math.max(filter.toBlock - BLOCK_PAGING_SIZE + 1, 0);

    events = await provider.getLogs(filter);
    if (events.length > 0) {
      foundEvent = true;
    }
  }
  return events[0];
}

async function main() {
  // Need to send transactions as the account in control of the production network
  signer = await ethers.getImpersonatedSigner("0x56a9212f7f495fadce1f27967bef5158199b36c7");
  const forkedBlock = await provider.getBlockNumber();

  await hre.run("deploy");

  // This is the address the network is deployed to in production
  const DEPLOYED_NETWORK_ADDRESS = "0x777760996135F0791E2e1a74aFAa060711197777";

  const fakeCN = await ethers.getContractAt("IColonyNetwork", DEPLOYED_NETWORK_ADDRESS, signer);
  const cn = await ethers.getContractAt("IColonyNetwork", FORKED_NETWORK_ADDRESS, signer);

  // Set the network to the new resolver address
  await copyResolver(DEPLOYED_NETWORK_ADDRESS, FORKED_NETWORK_ADDRESS);

  // Set the Token Locking contract to the new resolver address
  await copyResolver(await fakeCN.getTokenLocking(), await cn.getTokenLocking());

  // Reputation Mining
  const miningResolver = await fakeCN.getMiningResolver();
  await cn.setMiningResolver(miningResolver);

  const fakeMcAddress = await fakeCN.getMetaColony();
  const fakeMc = await ethers.getContractAt("IMetaColony", fakeMcAddress, signer);

  const mcAddress = await cn.getMetaColony();
  const mc = await ethers.getContractAt("IMetaColony", mcAddress, signer);

  const latestVersion = await fakeMc.version();

  // Is that version on the 'real' colonyNetwork?
  const resolver = await cn.getColonyVersionResolver(latestVersion);
  if (resolver === ethers.constants.AddressZero) {
    // Deploy the version resolver
    const newVersionResolverAddress = await fakeCN.getColonyVersionResolver(latestVersion);
    await mc.addColonyVersion(latestVersion, newVersionResolverAddress);
  }

  // Deploy latest versions for all extensions

  let filter = fakeCN.filters.ExtensionAddedToNetwork();
  filter.fromBlock = forkedBlock;
  const events = await provider.getLogs(filter);
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const extensionId = event.topics[1];
    const extensionVersion = parseInt(event.data, 16);
    const extensionResolver = await fakeCN.getExtensionResolver(extensionId, extensionVersion);
    await mc.addExtensionToNetwork(extensionId, extensionResolver);
  }
  console.log("Updated versions");

  // Get miner address

  filter = cn.filters.ReputationMiningCycleComplete();
  const completionEvent = await getMostRecentEvent(cn, filter);

  const completionTx = await provider.getTransaction(completionEvent.transactionHash);
  const sender = completionTx.from;
  console.log(sender, "is the miner address");

  // Save miner address to file
  fs.writeFileSync("miner-address.json", JSON.stringify({ minerAddress: sender }));

  // Download latest state for miner
  const finishedDownload = promisify(stream.finished);
  const writer = fs.createWriteStream(path.join(__dirname, "..", "packages", "reputation-miner", "reputationStates.sqlite"));

  const response = await axios({
    method: "GET",
    url: `${REPUTATION_URL}/latestState`,
    responseType: "stream",
  });

  response.data.pipe(writer);
  await finishedDownload(writer);

  process.exit();
}

main();
