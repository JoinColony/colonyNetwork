#!/usr/bin/env node

/*
 * Start the Reputation Miner/Oracle for local development
 * DO NOT USE IN PRODUCTION
 */
console.log("Not to be used in production");
if (process.env.NODE_ENV === "production") {
  process.exit(1);
}
const path = require("path");
const ethers = require("ethers");
const { TruffleLoader } = require("../packages/package-utils");
const { WAD } = require("../helpers/constants");

const loader = new TruffleLoader({
  contractDir: path.resolve(__dirname, "..", "build", "contracts"),
});

const ADDRESS_ZERO = ethers.constants.AddressZero;
const ethersForeignProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546");
const ethersForeignSigner = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546").getSigner();
const ethersHomeSigner = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545").getSigner();
// const ethersHomeProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
const BridgeMonitor = require("./bridgeMonitor");

async function start() {
  const accounts = await ethersForeignProvider.listAccounts();
  const GnosisSafeProxyFactory = await loader.load({ contractName: "GnosisSafeProxyFactory" }, { abi: true, address: false });
  const GnosisSafe = await loader.load({ contractName: "GnosisSafe" }, { abi: true, address: false });
  const ZodiacBridgeModuleMock = await loader.load({ contractName: "ZodiacBridgeModuleMock" }, { abi: true, address: false });
  const BridgeMock = await loader.load({ contractName: "BridgeMock" }, { abi: true, address: false });
  const Erc721Mock = await loader.load({ contractName: "ERC721Mock" }, { abi: true, address: false });
  const Token = await loader.load({ contractName: "Token" }, { abi: true, address: false });

  // This is the address that the gnosis safe proxy factory should have been deployed to by the deploy command using hardhat in their repo
  const gspf = await new ethers.Contract("0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", GnosisSafeProxyFactory.abi, ethersForeignSigner);

  // 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552 is the address the gnosis safe implementation should have been deployed at
  const receipt = await gspf.createProxy("0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0x");
  let tx = await receipt.wait();
  console.log(tx.events[0]);

  const safeAddress = tx.events[0].args.proxy;
  const gnosisSafe = await new ethers.Contract(safeAddress, GnosisSafe.abi, ethersForeignSigner);
  console.log("Gnosis Safe address: ", gnosisSafe.address);
  gnosisSafe.setup([accounts[0]], 1, ADDRESS_ZERO, "0x", ADDRESS_ZERO, ADDRESS_ZERO, 0, ADDRESS_ZERO);

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
    console.log("Safe did not contain exactly 1 NFT");
    process.exit();
  }

  // Add bridge module to safe

  const nonce = await gnosisSafe.nonce();

  const data = gnosisSafe.interface.encodeFunctionData("enableModule(address)", [zodiacBridge.address]);
  const safeTxArgs = [safeAddress, 0, data, 0, 100000, 100000, 0, ADDRESS_ZERO, ADDRESS_ZERO, nonce];
  const safeData = await gnosisSafe.encodeTransactionData(...safeTxArgs);
  const safeDataHash = await gnosisSafe.getTransactionHash(...safeTxArgs);

  const sig = await ethersForeignProvider.send("eth_sign", [accounts[0], safeDataHash]);
  const r = `${sig.substring(2, 66)}`;
  const s = `${sig.substring(66, 130)}`;

  // Add 4 to v for... reasons... see https://docs.gnosis-safe.io/contracts/signatures
  const vOffset = 4;
  const v = parseInt(sig.substring(130), 16) + vOffset;

  let vString;
  if (v < 16) {
    vString = `0${v.toString(16)}`;
  } else {
    vString = v.toString(16);
  }
  // put back together
  const modifiedSig = `0x${r}${s}${vString}`;
  console.log(modifiedSig);

  const res = await gnosisSafe.checkNSignatures(safeDataHash, safeData, modifiedSig, 1);
  console.log(res);

  tx = await gnosisSafe.execTransaction(...safeTxArgs.slice(0, -1), modifiedSig);

  console.log(tx);

  const enabled = await gnosisSafe.isModuleEnabled(zodiacBridge.address);

  if (!enabled) {
    process.exit(1);
  }

  // Deploy a foreign bridge

  const foreignBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersForeignSigner);
  const foreignBridge = await foreignBridgeFactory.deploy();
  await foreignBridge.deployTransaction.wait();

  // Deploy a home bridge
  const homeBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersHomeSigner);

  const homeBridge = await homeBridgeFactory.deploy();
  await homeBridge.deployTransaction.wait();

  // Start the bridge service
  const bm = new BridgeMonitor(homeBridge.address, foreignBridge.address, erc721.address, Token.address, zodiacBridge.address); // eslint-disable-line no-unused-vars
  console.log(`Home bridge address: ${homeBridge.address}`);
  console.log(`Foreign bridge address: ${foreignBridge.address}`);
  console.log(`Gnosis Safe address: ${gnosisSafe.address}`);
  console.log(`Zodiac Bridge module address: ${zodiacBridge.address}`);
  console.log(`ERC721 address: ${erc721.address}`);
  console.log(`Token address: ${token.address}`);
}

start();
