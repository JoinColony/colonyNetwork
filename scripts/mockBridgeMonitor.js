const ethers = require("ethers");

// eslint-disable-next-line import/no-unresolved
const bridgeAbi = require("../artifacts/contracts/testHelpers/WormholeMock.sol/WormholeMock.json").abi;
// eslint-disable-next-line import/no-unresolved
const wormholeBridgeForColonyAbi = require("../artifacts/contracts/bridging/WormholeBridgeForColony.sol/WormholeBridgeForColony.json").abi;

const ethereumAddressToWormholeAddress = (address) => {
  return ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(ethers.utils.hexlify(address)), 32);
};

class MockBridgeMonitor {
  /**
   * Constructor for (local) bridge monitor. Monitors specified bridge contracts that bridges
   * messages across in both directions. Does no validation or signing, so only to be used for
   * local development.
   * @param {string} homeRpc              The endpoint that the home chain can be queried on
   * @param {string} foreignRpc           The endpoint that the foreign chain can be queried on
   * @param {string} homeBridgeAddress    The address of the home bridge contract
   * @param {string} foreignBridgeAddress The address of the foreign bridge contract
   * @param {string} homeColonyBridgeAddress The address of the home colony bridge contract
   * @param {string} foreignColonyBridgeAddress The address of the foreign colony bridge contract
   */
  constructor(homeRpc, foreignRpc, homeBridgeAddress, foreignBridgeAddress, homeColonyBridgeAddress, foreignColonyBridgeAddress) {
    this.homeRpc = homeRpc;
    this.foreignRpc = foreignRpc;
    this.homeBridgeAddress = homeBridgeAddress;
    this.foreignBridgeAddress = foreignBridgeAddress;
    this.homeColonyBridgeAddress = homeColonyBridgeAddress;
    this.foreignColonyBridgeAddress = foreignColonyBridgeAddress;

    this.setupListeners();
  }

  getPromiseForNextBridgedTransaction(_count = 1) {
    return new Promise((resolve) => {
      this.bridgingPromiseCount = _count;
      this.resolveBridgingPromise = resolve;
    });
  }

  // VAAs are the primitives used on wormhole (Verified Action Approvals)
  // See https://docs.wormhole.com/wormhole/explore-wormhole/vaa for more details
  // Note that the documentation sometimes also calls them VMs (as does IWormhole)
  // I believe VM stands for 'Verified Message'
  async encodeMockVAA(sender, sequence, nonce, payload, consistencyLevel, chainId) {
    const version = 1;
    const timestamp = Math.floor(Date.now() / 1000);
    const emitterChainId = chainId;
    const emitterAddress = ethereumAddressToWormholeAddress(sender);
    const guardianSetIndex = 0;
    const signatures = [];
    const hash = ethers.utils.id("something");

    const vaa = await this.homeBridge.buildVM(
      version,
      timestamp,
      nonce,
      emitterChainId,
      emitterAddress,
      sequence.toString(),
      consistencyLevel,
      payload,
      guardianSetIndex,
      signatures,
      hash,
    );
    return vaa;
  }

  setupListeners() {
    if (this.homeBridge) {
      this.homeBridge.removeAllListeners("LogMessagePublished");
    }
    if (this.foreignBridge) {
      this.foreignBridge.removeAllListeners("LogMessagePublished");
    }

    this.signerHome = new ethers.providers.JsonRpcProvider(this.homeRpc).getSigner();
    this.signerForeign = new ethers.providers.JsonRpcProvider(this.foreignRpc).getSigner();
    this.homeBridge = new ethers.Contract(this.homeBridgeAddress, bridgeAbi, this.signerHome);
    this.foreignBridge = new ethers.Contract(this.foreignBridgeAddress, bridgeAbi, this.signerForeign);
    this.homeWormholeBridgeForColony = new ethers.Contract(this.homeColonyBridgeAddress, wormholeBridgeForColonyAbi, this.signerHome);
    this.foreignWormholeBridgeForColony = new ethers.Contract(this.foreignColonyBridgeAddress, wormholeBridgeForColonyAbi, this.signerForeign);

    this.skipCount = 0;

    this.queue = [];
    this.skipped = [];
    this.locked = false;
    this.homeBridge.on("LogMessagePublished", async (sender, sequence, nonce, payload, consistencyLevel) => {
      const { chainId } = await this.signerHome.provider.getNetwork();
      // For our local test chains, I've decreed that the wormhole chain ID is the evmChain ID modulo 265669, times 2
      const wormholeChainId = (chainId % 265669) * 2;

      if (this.skipCount > 0) {
        this.skipped.push([this.foreignWormholeBridgeForColony, sender, sequence, nonce, payload, consistencyLevel, wormholeChainId]);
        this.skipCount -= 1;
        return;
      }
      this.queue.push([this.foreignWormholeBridgeForColony, sender, sequence, nonce, payload, consistencyLevel, wormholeChainId]);
      await this.processQueue();
    });

    this.foreignBridge.on("LogMessagePublished", async (sender, sequence, nonce, payload, consistencyLevel) => {
      const { chainId } = await this.signerForeign.provider.getNetwork();
      const wormholeChainId = (chainId % 265669) * 2;

      if (this.skipCount > 0) {
        this.skipped.push([this.homeWormholeBridgeForColony, sender, sequence, nonce, payload, consistencyLevel, wormholeChainId]);
        this.skipCount -= 1;
        return;
      }
      this.queue.push([this.homeWormholeBridgeForColony, sender, sequence, nonce, payload, consistencyLevel, wormholeChainId]);

      await this.processQueue();
    });

    console.log("Mock Bridge Monitor running");
    console.log("Home bridge address: ", this.homeBridgeAddress);
    console.log("Foreign bridge address: ", this.foreignBridgeAddress);
  }

  close() {} // eslint-disable-line class-methods-use-this

  async processQueue() {
    if (this.locked) {
      return;
    }
    if (this.queue.length === 0) {
      return;
    }
    this.locked = true;
    const [bridge, sender, sequence, nonce, payload, consistencyLevel, wormholeChainID] = this.queue.shift();
    const vaa = await this.encodeMockVAA(sender, sequence, nonce, payload, consistencyLevel, wormholeChainID);
    const tx = await bridge.receiveMessage(vaa, { gasLimit: 1000000 });
    try {
      await tx.wait();
    } catch (err) {
      // We don't need to do anything here, we just want to make sure the transaction is mined
    }
    this.bridgingPromiseCount -= 1;

    if (this.bridgingPromiseCount === 0) {
      this.resolveBridgingPromise(tx);
    }
    if (this.locked) {
      this.locked = false;
    }
    if (this.queue.length > 0) {
      await this.processQueue();
    }
  }

  async bridgeSkipped() {
    const [bridge, sender, sequence, nonce, payload, consistencyLevel, homeWormholeChainId] = this.skipped.shift();
    const vaa = await this.encodeMockVAA(sender, sequence, nonce, payload, consistencyLevel, homeWormholeChainId);
    const tx = await bridge.receiveMessage(vaa, { gasLimit: 1000000 });
    try {
      await tx.wait();
    } catch (err) {
      // We don't need to do anything here, we just want to make sure the transaction is mined
    }
    this.bridgingPromiseCount -= 1;

    if (this.bridgingPromiseCount === 0) {
      this.resolveBridgingPromise(tx);
    }
  }

  async waitUntilSkipped() {
    return new Promise((resolve) => {
      setInterval(() => {
        if (this.skipCount === 0) {
          resolve();
        }
      }, 1000);
    });
  }

  reset() {
    this.skipCount = 0;
    this.queue = [];
    this.skipped = [];
    this.locked = false;
    this.setupListeners();
  }
}

module.exports = MockBridgeMonitor;
