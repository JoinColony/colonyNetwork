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
  contractDir: path.resolve(__dirname, "..", "build", "contracts"),
});

const ADDRESS_ZERO = ethers.constants.AddressZero;
const ethersForeignProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546");
const ethersForeignSigner = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546").getSigner();
const ethersHomeSigner = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545").getSigner();
// const ethersHomeProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
const BridgeMonitor = require("./bridgeMonitor");

async function start() {
  const accounts = await getGanacheAccounts();
  const GnosisSafeProxyFactory = await loader.load({ contractName: "GnosisSafeProxyFactory" }, { abi: true, address: false });
  const GnosisSafe = await loader.load({ contractName: "GnosisSafe" }, { abi: true, address: false });
  const ZodiacBridgeModuleMock = await loader.load({ contractName: "ZodiacBridgeModuleMock" }, { abi: true, address: false });
  const BridgeMock = await loader.load({ contractName: "BridgeMock" }, { abi: true, address: false });
  const erc721Mock = await loader.load({ contractName: "ERC721Mock" }, { abi: true, address: false });
  const TokenContract = await loader.load({ contractName: "Token" }, { abi: true, address: false });

  const gspf = await new ethers.Contract("0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", GnosisSafeProxyFactory.abi, ethersForeignSigner);

  const receipt = await gspf.createProxy("0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0x");
  let tx = await receipt.wait();
  console.log(tx.events[0]);

  const safeAddress = tx.events[0].args.proxy;
  const gs = await new ethers.Contract(safeAddress, GnosisSafe.abi, ethersForeignSigner);
  console.log("Gnosis Safe address: ", gs.address);
  gs.setup([accounts[0]], 1, ADDRESS_ZERO, "0x", ADDRESS_ZERO, ADDRESS_ZERO, 0, ADDRESS_ZERO);

  const zodiacBridgeFactory = new ethers.ContractFactory(ZodiacBridgeModuleMock.abi, ZodiacBridgeModuleMock.bytecode, ethersForeignSigner);
  const zb = await zodiacBridgeFactory.deploy(safeAddress);
  await zb.deployTransaction.wait();
  console.log("Bridge module address: ", zb.address);

  const erc721MockFactory = new ethers.ContractFactory(erc721Mock.abi, erc721Mock.bytecode, ethersForeignSigner);
  const erc721 = await erc721MockFactory.deploy();
  await erc721.deployTransaction.wait();

  console.log("ERC721 address: ", erc721.address);

  const tokenId = 1;
  const mintTx = await erc721.mint(gs.address, tokenId);
  await mintTx.wait();
  const inventory = await erc721.balanceOf(gs.address);
  console.log(`Safe ${gs.address} contains ${inventory} NFT.`); // Should eq 1.

  const TokenFactory = new ethers.ContractFactory(TokenContract.abi, TokenContract.bytecode, ethersForeignSigner);
  const Token = await TokenFactory.deploy("Test", "TST", 18);
  await Token.deployTransaction.wait();

  console.log("Token address: ", Token.address);

  await Token.unlock();
  const mintTokensTx = await Token["mint(address,uint256)"](gs.address, WAD.muln(100).toString());
  await mintTokensTx.wait();
  const safeBalance = await Token.balanceOf(gs.address);
  console.log(`Safe ${gs.address} contains ${safeBalance} tokens.`); // Should eq 100000000000000000000.

  // Add bridge module to safe

  const nonce = await gs.nonce();

  const data = gs.interface.encodeFunctionData("enableModule(address)", [zb.address]);
  const safeTxArgs = [safeAddress, 0, data, 0, 100000, 100000, 0, ADDRESS_ZERO, ADDRESS_ZERO, nonce];
  const safeData = await gs.encodeTransactionData(...safeTxArgs);
  const safeDataHash = await gs.getTransactionHash(...safeTxArgs);

  // const sig = await web3.eth.sign(safeDataHash, accounts[0]);
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

  const res = await gs.checkNSignatures(safeDataHash, safeData, modifiedSig, 1);
  console.log(res);

  tx = await gs.execTransaction(...safeTxArgs.slice(0, -1), modifiedSig);

  console.log(tx);

  const enabled = await gs.isModuleEnabled(zb.address);

  if (!enabled) {
    process.exit(1);
  }

  // Deploy a foreign bridge

  const foreignBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersForeignSigner);
  const fb = await foreignBridgeFactory.deploy();
  await fb.deployTransaction.wait();

  // Deploy a home bridge
  const homeBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersHomeSigner);

  const hb = await homeBridgeFactory.deploy();
  await hb.deployTransaction.wait();

  // Start the bridge service
  const bm = new BridgeMonitor(hb.address, fb.address, erc721.address, Token.address, zb.address); // eslint-disable-line no-unused-vars
  console.log(`Home bridge address: ${hb.address}`);
  console.log(`Foreign bridge address: ${fb.address}`);
  console.log(`Gnosis Safe address: ${gs.address}`);
  console.log(`Zodiac Bridge module address: ${zb.address}`);
  console.log(`ERC721 address: ${erc721.address}`);
  console.log(`Token address: ${Token.address}`);
}

async function getGanacheAccounts() {
  return ethersForeignProvider.listAccounts();
}

start();
