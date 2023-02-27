/* globals artifacts */
const fs = require("fs");
const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const Promise = require("bluebird");

const exec = Promise.promisify(require("child_process").exec);

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const Token = artifacts.require("Token");
const IColony = artifacts.require("IColony");
const GnosisSafeProxyFactory = artifacts.require("GnosisSafeProxyFactory");
const GnosisSafe = artifacts.require("GnosisSafe");
const ZodiacBridgeModuleMock = artifacts.require("ZodiacBridgeModuleMock");
const BridgeMock = artifacts.require("BridgeMock");

const BridgeMonitor = require("../../scripts/bridgeMonitor");

contract("Cross-chain", (accounts) => {
  let colony;
  let homeBridge;
  let foreignBridge;
  let gnosisSafe;
  let zodiacBridge;
  let bridgeMonitor;

  const ADDRESS_ZERO = ethers.constants.AddressZero;

  const TRUFFLE_PORT = process.env.SOLIDITY_COVERAGE ? 8555 : 8545;
  const OTHER_RPC_PORT = 8546;

  const HOME_PORT = process.env.TRUFFLE_FOREIGN === "true" ? OTHER_RPC_PORT : TRUFFLE_PORT;
  const FOREIGN_PORT = process.env.TRUFFLE_FOREIGN === "true" ? TRUFFLE_PORT : OTHER_RPC_PORT;

  const ethersForeignSigner = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${FOREIGN_PORT}`).getSigner();
  const ethersHomeSigner = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${HOME_PORT}`).getSigner();

  before(async () => {
    await exec(
      `cd ./lib/safe-contracts &&
      export PK="0x0355596cdb5e5242ad082c4fe3f8bbe48c9dba843fe1f99dd8272f487e70efae" &&
      rm -rf ./deployments/custom &&
      NODE_URL=http://127.0.0.1:${FOREIGN_PORT} yarn hardhat --network custom deploy`
    );
    const gnosisSafeProxyFactory = await new ethers.Contract(
      "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
      GnosisSafeProxyFactory.abi,
      ethersForeignSigner
    );

    const receipt = await gnosisSafeProxyFactory.createProxy("0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0x");
    let tx = await receipt.wait();

    const safeAddress = tx.events[0].args.proxy;
    gnosisSafe = await new ethers.Contract(safeAddress, GnosisSafe.abi, ethersForeignSigner);
    console.log("Gnosis Safe address: ", gnosisSafe.address);
    gnosisSafe.setup([accounts[0]], 1, ADDRESS_ZERO, "0x", ADDRESS_ZERO, ADDRESS_ZERO, 0, ADDRESS_ZERO);

    const zodiacBridgeFactory = new ethers.ContractFactory(ZodiacBridgeModuleMock.abi, ZodiacBridgeModuleMock.bytecode, ethersForeignSigner);
    zodiacBridge = await zodiacBridgeFactory.deploy(safeAddress);
    await zodiacBridge.deployTransaction.wait();

    console.log("Bridge module address", zodiacBridge.address);

    // Add bridge module to safe

    const nonce = await gnosisSafe.nonce();

    const data = gnosisSafe.interface.encodeFunctionData("enableModule(address)", [zodiacBridge.address]);
    const safeTxArgs = [safeAddress, 0, data, 0, 100000, 100000, 0, ADDRESS_ZERO, ADDRESS_ZERO, nonce];
    // const safeData = await gnosisSafe.encodeTransactionData(...safeTxArgs);
    const safeDataHash = await gnosisSafe.getTransactionHash(...safeTxArgs);

    const sig = await web3.eth.sign(safeDataHash, accounts[0]);
    const r = `${sig.substring(2, 66)}`;
    const s = `${sig.substring(66, 130)}`;

    // TODO: This isn't going to be right for every combination of coverage/no coverage home/away
    let vOffset = process.env.SOLIDITY_COVERAGE ? 27 : 0;
    // Add 4 to v for... reasons... see https://docs.gnosis-safe.io/contracts/signatures
    vOffset += 4;
    const v = parseInt(sig.substring(130), 16) + vOffset;

    // put back together
    const modifiedSig = `0x${r}${s}${ethers.utils.hexlify(v).slice(2)}`;

    // const res = await gnosisSafe.checkNSignatures(safeDataHash, safeData, modifiedSig, 1);
    tx = await gnosisSafe.execTransaction(...safeTxArgs.slice(0, -1), modifiedSig);

    const enabled = await gnosisSafe.isModuleEnabled(zodiacBridge.address);

    if (!enabled) {
      process.exit(1);
    }

    // Deploy a foreign bridge

    const foreignBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersForeignSigner);
    foreignBridge = await foreignBridgeFactory.deploy();
    await foreignBridge.deployTransaction.wait();

    // Deploy a home bridge
    const homeBridgeFactory = new ethers.ContractFactory(BridgeMock.abi, BridgeMock.bytecode, ethersHomeSigner);
    homeBridge = await homeBridgeFactory.deploy();
    await homeBridge.deployTransaction.wait();

    const homeRPC = `http://127.0.0.1:${HOME_PORT}`;
    const foreignRPC = `http://127.0.0.1:${FOREIGN_PORT}`;

    // Start the bridge service
    bridgeMonitor = new BridgeMonitor(homeRPC, foreignRPC, homeBridge.address, foreignBridge.address);

    // If Truffle is not on the home chain, then deploy colonyNetwork to the home chain
    if (process.env.TRUFFLE_FOREIGN === "true") {
      try {
        await exec(`yarn run provision:token:contracts`);
        await exec(`yarn run provision:safe:contracts`);
        await exec(`yarn run truffle migrate --network development2`);
      } catch (err) {
        console.log(err);

        process.exit();
      }
    }
  });

  beforeEach(async () => {
    // Set up a colony on the home chain. That may or may not be the truffle chain...
    // Get the etherrouter address
    const homeNetworkId = await ethersHomeSigner.provider.send("net_version", []);
    const homeChainId = await ethersHomeSigner.provider.send("eth_chainId", []);
    let etherRouterInfo;
    if (homeChainId.toString() === "0x539") {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build-coverage/contracts/EtherRouter.json"));
    } else {
      etherRouterInfo = JSON.parse(fs.readFileSync("./build/contracts/EtherRouter.json"));
    }

    const etherRouterAddress = etherRouterInfo.networks[homeNetworkId.toString()].address;

    const colonyNetworkEthers = await new ethers.Contract(etherRouterAddress, IColonyNetwork.abi, ethersHomeSigner);

    let tx = await colonyNetworkEthers.deployTokenViaNetwork("A", "A", 18);
    let res = await tx.wait();

    const { tokenAddress } = res.events.filter((x) => x.event === "TokenDeployed")[0].args;
    // token = await new ethers.Contract(tokenAddress, Token.abi, ethersHomeSigner);

    tx = await colonyNetworkEthers["createColony(address,uint256,string,string)"](tokenAddress, 0, "", "");
    res = await tx.wait();

    const { colonyAddress } = res.events.filter((x) => x.event === "ColonyAdded")[0].args;

    colony = await new ethers.Contract(colonyAddress, IColony.abi, ethersHomeSigner);
  });

  after(async () => {
    await bridgeMonitor.close();
  });

  describe("when controlling a gnosis wallet on another chain", async () => {
    it("can send tokens out of the gnosis safe", async () => {
      // Create token contract on foreign chain

      const tokenFactory = new ethers.ContractFactory(Token.abi, Token.bytecode, ethersForeignSigner);
      const fToken = await tokenFactory.deploy("Test", "TST", 18);
      await fToken.deployTransaction.wait();
      await fToken.unlock();
      // Send some to safe
      // console.log(fToken);
      await fToken["mint(address,uint256)"](gnosisSafe.address, 100);

      // We want the safe to execute this transaction...
      const txDataToExecuteFromSafe = await fToken.interface.encodeFunctionData("transfer", [ADDRESS_ZERO, 10]);
      // Which we trigger by sending a transaction to the module...
      const txDataToBeSentToZodiacModule = zodiacBridge.interface.encodeFunctionData("executeTransaction", [
        fToken.address,
        0,
        txDataToExecuteFromSafe,
        0,
      ]);
      // Which we trigger by sending a transaction to the module...

      // So what's the tx data for what we want the colony to call on the amb?
      const txDataToBeSentToAMB = homeBridge.interface.encodeFunctionData("requireToPassMessage", [
        zodiacBridge.address,
        txDataToBeSentToZodiacModule,
        1000000,
      ]);
      // Which we trigger by sending a transaction to the module...

      // Set up promise that will see it bridged across
      const p = new Promise((resolve) => {
        foreignBridge.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          resolve();
        });
      });

      // So 'just' call that on the colony...

      const tx = await colony.makeArbitraryTransaction(homeBridge.address, txDataToBeSentToAMB);
      await tx.wait();
      await p;
      // Check balances
      const b1 = await fToken.balanceOf(gnosisSafe.address);
      expect(b1.toNumber()).to.equal(90);
      const b2 = await fToken.balanceOf(ADDRESS_ZERO);
      expect(b2.toNumber()).to.equal(10);
    });
  });
});
