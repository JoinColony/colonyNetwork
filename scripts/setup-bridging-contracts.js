#!/usr/bin/env node

/*
 * Start the Reputation Miner/Oracle for local development
 * DO NOT USE IN PRODUCTION
 */

const path = require("path");
const ethers = require("ethers");
const { TruffleLoader } = require("../packages/package-utils");
const { WAD } = require("../helpers/constants");

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", `artifacts${process.env.SOLIDITY_COVERAGE ? "-coverage" : ""}`, "contracts"),
});

const ADDRESS_ZERO = ethers.constants.AddressZero;
const MockBridgeMonitor = require("./mockBridgeMonitor");

async function setupBridging(homeRpcUrl, foreignRpcUrl) {
  console.log("setup-bridging-contracts: Not to be used in production");
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }

  const ethersForeignProvider = new ethers.providers.JsonRpcProvider(foreignRpcUrl);
  const ethersForeignSigner = ethersForeignProvider.getSigner();
  const ethersHomeProvider = new ethers.providers.JsonRpcProvider(homeRpcUrl);
  const ethersHomeSigner = ethersHomeProvider.getSigner();

  const accounts = await ethersForeignProvider.listAccounts();

  let contractDir;
  contractDir = path.resolve(__dirname, "..", "artifacts", "lib", "safe-contracts", "contracts");
  const GnosisSafe = await loader.load({ contractDir, contractName: "GnosisSafe" });

  contractDir = path.resolve(__dirname, "..", "artifacts", "lib", "safe-contracts", "contracts", "proxies");
  const GnosisSafeProxyFactory = await loader.load({ contractDir, contractName: "GnosisSafeProxyFactory" });

  contractDir = path.resolve(__dirname, "..", "artifacts", "contracts", "testHelpers");
  const ZodiacBridgeModuleMock = await loader.load({ contractDir, contractName: "ZodiacBridgeModuleMock" });
  const Erc721Mock = await loader.load({ contractDir, contractName: "ERC721Mock" });

  contractDir = path.resolve(__dirname, "..", "artifacts", "colonyToken");
  const Token = await loader.load({ contractDir, contractName: "Token" });

  // This is the address that the gnosis safe proxy factory should have been deployed to by the deploy command using hardhat in their repo
  const gspf = new ethers.Contract("0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", GnosisSafeProxyFactory.abi, ethersForeignSigner);

  // 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552 is the address the gnosis safe implementation should have been deployed at
  let receipt = await gspf.createProxy("0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0x");
  let tx = await receipt.wait();

  const safeAddress = tx.events[0].args.proxy;
  const gnosisSafe = new ethers.Contract(safeAddress, GnosisSafe.abi, ethersForeignSigner);
  console.log("Gnosis Safe address: ", gnosisSafe.address);

  receipt = await gnosisSafe.setup([accounts[0]], 1, ADDRESS_ZERO, "0x", ADDRESS_ZERO, ADDRESS_ZERO, 0, ADDRESS_ZERO);
  await receipt.wait();

  const zodiacBridgeFactory = new ethers.ContractFactory(ZodiacBridgeModuleMock.abi, ZodiacBridgeModuleMock.bytecode, ethersForeignSigner);
  const zodiacBridge = await zodiacBridgeFactory.deploy(safeAddress);
  await zodiacBridge.deployTransaction.wait();
  console.log("Bridge module address: ", zodiacBridge.address);

  const erc721MockFactory = new ethers.ContractFactory(Erc721Mock.abi, Erc721Mock.bytecode, ethersForeignSigner);
  const erc721 = await erc721MockFactory.deploy();
  await erc721.deployTransaction.wait();
  console.log("ERC721 address: ", erc721.address);

  const tokenId = 1;
  const mintTx = await erc721.mint(gnosisSafe.address, tokenId);
  await mintTx.wait();
  const inventory = await erc721.balanceOf(gnosisSafe.address);

  console.log(`Safe ${gnosisSafe.address} contains ${inventory} NFT.`); // Should eq 1.
  if (inventory.toString() !== "1") {
    console.log("Safe did not contain exactly 1 NFT");
    process.exit();
  }

  const TokenFactory = new ethers.ContractFactory(Token.abi, Token.bytecode, ethersForeignSigner);
  const token = await TokenFactory.deploy("Test", "TST", 18);
  await token.deployTransaction.wait();
  console.log("Token address: ", Token.address);

  await token.unlock();
  const mintTokensTx = await token["mint(address,uint256)"](gnosisSafe.address, WAD.muln(100).toString());
  await mintTokensTx.wait();
  const safeBalance = await token.balanceOf(gnosisSafe.address);

  console.log(`Safe ${gnosisSafe.address} contains ${safeBalance} tokens.`); // Should eq 100000000000000000000.
  if (safeBalance.toString() !== "100000000000000000000") {
    console.log("Safe did not contain exactly 100000000000000000000 tokens after minting");
    process.exit();
  }

  // Add bridge module to safe

  const nonce = await gnosisSafe.nonce();

  const data = gnosisSafe.interface.encodeFunctionData("enableModule(address)", [zodiacBridge.address]);
  const safeTxArgs = [safeAddress, 0, data, 0, 100000, 100000, 0, ADDRESS_ZERO, ADDRESS_ZERO, nonce];
  const safeData = await gnosisSafe.encodeTransactionData(...safeTxArgs);
  const safeDataHash = await gnosisSafe.getTransactionHash(...safeTxArgs);

  const sig = await getSig(ethersForeignProvider, accounts[0], safeDataHash);

  await gnosisSafe.checkNSignatures(safeDataHash, safeData, sig, 1);

  tx = await gnosisSafe.execTransaction(...safeTxArgs.slice(0, -1), sig);

  const enabled = await gnosisSafe.isModuleEnabled(zodiacBridge.address);

  if (!enabled) {
    console.log("Gnosis safe did not have bridge module enabled, exiting");
    process.exit(1);
  }

  // Deploy a foreign bridge
  const [foreignBridge, foreignColonyBridge] = await deployBridge(ethersForeignSigner);

  // Deploy a home bridge
  const [homeBridge, homeColonyBridge] = await deployBridge(ethersHomeSigner);

  // Start the bridge service
  console.log(`Home RPC Url: ${homeRpcUrl}`);
  console.log(`Foreign RPC Url: ${foreignRpcUrl}`);
  const bridgeMonitor = new MockBridgeMonitor(
    homeRpcUrl,
    foreignRpcUrl,
    homeBridge.address,
    foreignBridge.address,
    homeColonyBridge.address,
    foreignColonyBridge.address,
  ); // eslint-disable-line no-unused-vars
  console.log(`Home bridge address: ${homeBridge.address}`);
  console.log(`Foreign bridge address: ${foreignBridge.address}`);
  console.log(`Home colony bridge address: ${homeColonyBridge.address}`);
  console.log(`Foreign colony bridge address: ${foreignColonyBridge.address}`);
  console.log(`Gnosis Safe address: ${gnosisSafe.address}`);
  console.log(`Zodiac Bridge module address: ${zodiacBridge.address}`);
  console.log(`ERC721 address: ${erc721.address}`);
  console.log(`Token address: ${token.address}`);
  return { gnosisSafe, bridgeMonitor, zodiacBridge, homeBridge, foreignBridge, homeColonyBridge, foreignColonyBridge };
}

async function getSig(provider, account, dataHash) {
  const sig = await provider.send("eth_sign", [account, dataHash]);
  const r = `${sig.substring(2, 66)}`;
  const s = `${sig.substring(66, 130)}`;

  // Add 4 to v for... reasons... see https://docs.gnosis-safe.io/contracts/signatures
  const v = parseInt(sig.substring(130), 16) + 4;
  const vString = ethers.utils.hexlify(v).slice(2);

  // put back together
  const modifiedSig = `0x${r}${s}${vString}`;
  return modifiedSig;
}

async function deployBridge(signer) {
  let contractDir = path.resolve(__dirname, "..", "artifacts", "contracts", "bridging");
  const WormholeBridgeForColony = await loader.load({ contractDir, contractName: "WormholeBridgeForColony" }, { abi: true, address: false });
  const bridgeFactory = new ethers.ContractFactory(WormholeBridgeForColony.abi, WormholeBridgeForColony.bytecode, signer);
  const bridge = await bridgeFactory.deploy();
  await bridge.deployTransaction.wait();

  contractDir = path.resolve(__dirname, "..", "artifacts", "contracts", "testHelpers");
  const WormholeMock = await loader.load({ contractDir, contractName: "WormholeMock" }, { abi: true, address: false });
  const wormholeFactory = new ethers.ContractFactory(WormholeMock.abi, WormholeMock.bytecode, signer);
  const wormhole = await wormholeFactory.deploy();
  await wormhole.deployTransaction.wait();

  let tx = await bridge.setWormholeAddress(wormhole.address);
  await tx.wait();
  tx = await bridge.setChainIdMapping([100, 265669100, 265669101], [200, 200, 202]);
  await tx.wait();

  return [wormhole, bridge];
}

if (process.argv.includes("start-bridging-environment")) {
  setupBridging("http://127.0.0.1:8545", "http://127.0.0.1:8546");
}

module.exports = { setupBridging, deployBridge };
