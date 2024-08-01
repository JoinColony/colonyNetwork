/* global hre */
const { ethers } = require("hardhat");

const ARBITRUM_SEPOLIA_NETWORK_ADDRESS = "0x7777494e3d8cce0D3570E21FEf820F9Fee077777";
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

async function main() {
  const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  signer = await ethers.getImpersonatedSigner("0x56a9212f7f495fadce1f27967bef5158199b36c7");
  const forkedBlock = await provider.getBlockNumber();

  await hre.run("deploy");

  const DEPLOYED_NETWORK_ADDRESS = "0x777760996135F0791E2e1a74aFAa060711197777";

  const fakeCN = await ethers.getContractAt("IColonyNetwork", DEPLOYED_NETWORK_ADDRESS, signer);
  const cn = await ethers.getContractAt("IColonyNetwork", ARBITRUM_SEPOLIA_NETWORK_ADDRESS, signer);

  // Set the network to the new resolver address
  await copyResolver(DEPLOYED_NETWORK_ADDRESS, ARBITRUM_SEPOLIA_NETWORK_ADDRESS);

  // Set the Token Locking contract to the new resolver address
  await copyResolver(await fakeCN.getTokenLocking(), await cn.getTokenLocking());

  // Reputation Mining
  const miningResolver = await fakeCN.getMiningResolver();
  await cn.setMiningResolver(miningResolver);

  const latestBlockNumber = await provider.getBlockNumber();
  let filter = fakeCN.filters.ColonyNetworkInitialised();
  filter.fromBlock = latestBlockNumber + 1; // +1 to accommodate the first loop iteration
  filter.toBlock = filter.fromBlock;
  let foundEvent = false;
  let events;
  const BLOCK_PAGING_SIZE = 100;
  while (filter.toBlock > 0 && !foundEvent) {
    // Create a span of events up to BLOCK_PAGING_SIZE in length
    filter.toBlock = filter.fromBlock - 1;
    filter.fromBlock = Math.max(filter.toBlock - BLOCK_PAGING_SIZE + 1, 0);

    events = await provider.getLogs(filter);
    if (events.length > 0) {
      foundEvent = true;
    }
  }

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

  filter = fakeCN.filters.ExtensionAddedToNetwork();
  filter.fromBlock = forkedBlock;
  events = await provider.getLogs(filter);
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const extensionId = event.topics[1];
    const extensionVersion = parseInt(event.data, 16);
    const extensionResolver = await fakeCN.getExtensionResolver(extensionId, extensionVersion);
    await mc.addExtensionToNetwork(extensionId, extensionResolver);
  }
  console.log("Updated versions");
  process.exit();
}

main();
