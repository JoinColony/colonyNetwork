/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");
const { ethers } = require("ethers");

const { setupRandomColony } = require("../../helpers/test-data-generator");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const EtherRouter = artifacts.require("EtherRouter");
const Token = artifacts.require("Token");
const GnosisSafeProxyFactory = artifacts.require("GnosisSafeProxyFactory");
const GnosisSafe = artifacts.require("GnosisSafe");
const ZodiacBridgeModuleMock = artifacts.require("ZodiacBridgeModuleMock");
const BridgeMock = artifacts.require("BridgeMock");

const BridgeMonitor = require("../../scripts/bridgeMonitor");

contract("Cross-chain", (accounts) => {
  let colony;
  let colonyNetwork;
  let hb;
  let fb;
  let gs;
  let zb;
  let bs;

  const ADDRESS_ZERO = ethers.constants.AddressZero;
  const ethersForeignSigner = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8546").getSigner();

  before(async () => {
    const gspf = await new ethers.Contract("0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", GnosisSafeProxyFactory.abi, ethersForeignSigner);

    const receipt = await gspf.createProxy("0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", "0x");
    let tx = await receipt.wait();
    console.log(tx.events[0]);

    const safeAddress = tx.events[0].args.proxy;
    gs = await new ethers.Contract(safeAddress, GnosisSafe.abi, ethersForeignSigner);
    console.log("Gnosis Safe address: ", gs.address);
    gs.setup([accounts[0]], 1, ADDRESS_ZERO, "0x", ADDRESS_ZERO, ADDRESS_ZERO, 0, ADDRESS_ZERO);

    const zodiacBridgeFactory = new ethers.ContractFactory(ZodiacBridgeModuleMock.abi, ZodiacBridgeModuleMock.bytecode, ethersForeignSigner);
    zb = await zodiacBridgeFactory.deploy(safeAddress);
    await zb.deployTransaction.wait();

    console.log("Bridge module address", zb.address);

    // Add bridge module to safe

    const nonce = await gs.nonce();

    const data = gs.interface.encodeFunctionData("enableModule(address)", [zb.address]);
    const safeTxArgs = [safeAddress, 0, data, 0, 100000, 100000, 0, ADDRESS_ZERO, ADDRESS_ZERO, nonce];
    const safeData = await gs.encodeTransactionData(...safeTxArgs);
    const safeDataHash = await gs.getTransactionHash(...safeTxArgs);

    const sig = await web3.eth.sign(safeDataHash, accounts[0]);
    const r = `${sig.substring(2, 66)}`;
    const s = `${sig.substring(66, 130)}`;

    let vOffset = process.env.SOLIDITY_COVERAGE ? 27 : 0;
    // Add 4 to v for... reasons... see https://docs.gnosis-safe.io/contracts/signatures
    vOffset += 4;
    const v = parseInt(sig.substring(130), 16) + vOffset;

    // put back together
    const modifiedSig = `0x${r}${s}${ethers.utils.hexlify(v).slice(2)}`;
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
    fb = await foreignBridgeFactory.deploy();
    await fb.deployTransaction.wait();

    // Deploy a home bridge
    hb = await BridgeMock.new();

    const homeRPC = `http://127.0.0.1:${process.env.SOLIDITY_COVERAGE ? 8555 : 8545}`;
    const foreignRPC = `http://127.0.0.1:${process.env.SOLIDITY_COVERAGE ? 8546 : 8546}`;
    // Start the bridge service
    bs = new BridgeMonitor(homeRPC, foreignRPC, hb.address, fb.address);
  });

  beforeEach(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    ({ colony } = await setupRandomColony(colonyNetwork));
  });

  after(async () => {
    await bs.close();
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
      await fToken["mint(address,uint256)"](gs.address, 100);

      // We want the safe to execute this transaction...
      const txDataToExecuteFromSafe = await fToken.interface.encodeFunctionData("transfer", [ADDRESS_ZERO, 10]);
      // Which we trigger by sending a transaction to the module...
      const txDataToBeSentToZodiacModule = zb.interface.encodeFunctionData("executeTransaction", [fToken.address, 0, txDataToExecuteFromSafe, 0]);
      // Which we trigger by sending a transaction to the module...

      // So what's the tx data for what we want the colony to call on the amb?
      const txDataToBeSentToAMB = hb.contract.methods.requireToPassMessage(zb.address, txDataToBeSentToZodiacModule, 1000000).encodeABI();
      // Which we trigger by sending a transaction to the module...

      // Set up promise that will see it bridged across
      const p = new Promise((resolve) => {
        fb.on("RelayedMessage", async (_sender, msgSender, _messageId, success) => {
          console.log("bridged with ", _sender, msgSender, _messageId, success);
          resolve();
        });
      });

      // So 'just' call that on the colony...

      await colony.makeArbitraryTransaction(hb.address, txDataToBeSentToAMB);
      console.log("made");
      await p;
      console.log("awaited");
      // Check balances
      const b1 = await fToken.balanceOf(gs.address);
      expect(b1.toNumber()).to.equal(90);
      const b2 = await fToken.balanceOf(ADDRESS_ZERO);
      expect(b2.toNumber()).to.equal(10);
    });
  });
});
