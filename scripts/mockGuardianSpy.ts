/* eslint-disable import/no-extraneous-dependencies */

import { Server, ServerCredentials } from "@grpc/grpc-js";
import { ethers } from "ethers";

import { FilterEntry, SpyRPCServiceService } from "../lib/wormhole/sdk/js-proto-node/src/spy/v1/spy";
import { FORKED_XDAI_CHAINID } from "../helpers/constants";

import { RetryProvider } from "../packages/package-utils";
// Random key

// import ethers from "ethers";

// eslint-disable-next-line import/no-unresolved
const bridgeAbi = require("../artifacts/contracts/testHelpers/WormholeMock.sol/WormholeMock.json").abi;
// eslint-disable-next-line import/no-unresolved
const wormholeBridgeForColonyAbi = require("../artifacts/contracts/bridging/WormholeBridgeForColony.sol/WormholeBridgeForColony.json").abi;

function ethereumAddressToWormholeAddress(address: string) {
  return ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(ethers.utils.hexlify(address)), 32);
}

class MockBridgeMonitor {
  homeRpc: string;

  foreignRpc: string;

  homeBridgeAddress: string;

  foreignBridgeAddress: string;

  homeColonyBridgeAddress: string;

  foreignColonyBridgeAddress: string;

  homeBridge: any;

  foreignBridge: any;

  homeWormholeBridgeForColony: any;

  foreignWormholeBridgeForColony: any;

  skipCount: number = 0;

  queue: any[] = [];

  skipped: any[] = [];

  locked: boolean = false;

  bridgingPromiseCount: number = 0;

  resolveBridgingPromise: any;

  signerHome: any;

  signerForeign: any;

  server: Server;

  subscription: any;

  subscriptionFilters: FilterEntry[] = [];

  relayerAddress: string;

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
  constructor(
    homeRpc: string,
    foreignRpc: string,
    homeBridgeAddress: string,
    foreignBridgeAddress: string,
    homeColonyBridgeAddress: string,
    foreignColonyBridgeAddress: string,
  ) {
    this.homeRpc = homeRpc;
    this.foreignRpc = foreignRpc;
    this.homeBridgeAddress = homeBridgeAddress;
    this.foreignBridgeAddress = foreignBridgeAddress;
    this.homeColonyBridgeAddress = homeColonyBridgeAddress;
    this.foreignColonyBridgeAddress = foreignColonyBridgeAddress;

    this.setupListeners();

    this.server = new Server();

    this.server.addService(SpyRPCServiceService, {
      subscribeSignedVAA: (subscription: any) => {
        this.subscription = subscription;
        this.subscriptionFilters = subscription.request.filters;
        // setTimeout(() => {
        //     subscription.write({vaaBytes: Buffer.from(vaa, 'base64')});
        // }, 1000);
      },
    });

    this.relayerAddress = "0x770656997AE1C8AB0250571ca1dff5c5A3C37700";

    this.server.bindAsync("0.0.0.0:7073", ServerCredentials.createInsecure(), () => {
      console.log("server is running on 0.0.0.0:7073");
    });
  }

  getPromiseForNextBridgedTransaction(_count = 1) {
    return new Promise((resolve) => {
      this.bridgingPromiseCount = _count;
      this.resolveBridgingPromise = resolve;
    });
  }

  static async getTransactionFromAddressWithNonce(provider: ethers.providers.JsonRpcProvider, address: string, nonce: number) {
    const currentBlock = await provider.getBlockNumber();
    for (let i = currentBlock; i > 0; i -= 1) {
      const block = await provider.getBlock(i);
      for (const txHash of block.transactions) {
        const tx = await provider.getTransaction(txHash);
        if (tx.from === address && tx.nonce === nonce) {
          return tx;
        }
      }
    }
    throw new Error("Unable to find transaction with provided nonce");
  }

  // VAAs are the primitives used on wormhole (Verified Action Approvals)
  // See https://docs.wormhole.com/wormhole/explore-wormhole/vaa for more details
  // Note that the documentation sometimes also calls them VMs (as does IWormhole)
  // I believe VM stands for 'Verified Message'
  async encodeMockVAA(sender: string, sequence: number, nonce: number, payload: string, consistencyLevel: number, chainId: number) {
    const timestamp = Math.floor(Date.now() / 1000);
    const emitterChainId = chainId;
    const emitterAddress = ethereumAddressToWormholeAddress(sender);

    // const vaa = await this.homeBridge.buildVM(
    //   version,
    //   timestamp,
    //   nonce,
    //   emitterChainId,
    //   emitterAddress,
    //   sequence.toString(),
    //   consistencyLevel,
    //   payload,
    //   guardianSetIndex,
    //   signatures,
    //   hash,
    // );

    // Build the VAA body
    const vaaBody = await this.homeBridge.buildVAABody(timestamp, nonce, emitterChainId, emitterAddress, sequence, consistencyLevel, payload);

    // const signatures = guardians.addSignatures(vaaBody, [0]);
    // Build the VAA header

    const vaaHeader    =
      "0x01" + // version
      "00000000" + // guardianSetIndex
      "01" + // signature count
      "01" + // signature index
      "7777000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007777";

    return vaaHeader + vaaBody.toString("hex").slice(2);
  }

  setupListeners() {
    if (this.homeBridge) {
      this.homeBridge.removeAllListeners("LogMessagePublished");
    }
    if (this.foreignBridge) {
      this.foreignBridge.removeAllListeners("LogMessagePublished");
    }

    this.signerHome = new RetryProvider(this.homeRpc).getSigner();
    this.signerForeign = new RetryProvider(this.foreignRpc).getSigner();

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
      // Due to limitations, for local testing, our wormhole chainIDs have to be 'real' wormhole chainids.
      // So I've decreed that for chainId 256669100, we use 10003 (which is really arbitrum sepolia)
      // and for chainId 256669101, we use 10002 (which is really sepolia).
      // This isn't ideal, but it's the best solution I have for now
      let wormholeChainId;
      if (chainId === FORKED_XDAI_CHAINID) {
        wormholeChainId = 10003;
      } else if (chainId === FORKED_XDAI_CHAINID + 1) {
        wormholeChainId = 10002;
      } else {
        throw new Error("Unsupported chainId");
      }

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
      // Due to limitations, for local testing, our wormhole chainIDs have to be 'real' wormhole chainids.
      // So I've decreed that for chainId 256669100, we use 10003 (which is really arbitrum sepolia)
      // and for chainId 256669101, we use 10002 (which is really sepolia).
      // This isn't ideal, but it's the best solution I have for now
      let wormholeChainId;
      if (chainId === FORKED_XDAI_CHAINID) {
        wormholeChainId = 10003;
      } else if (chainId === FORKED_XDAI_CHAINID + 1) {
        wormholeChainId = 10002;
      } else {
        throw new Error("Unsupported chainId");
      }

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
    let tx;
    // If it passes the filter, send it
    if (
      this.subscriptionFilters.filter((f) => {
        return (
          f?.emitterFilter?.chainId === wormholeChainID && f?.emitterFilter?.emitterAddress === ethereumAddressToWormholeAddress(sender).slice(2)
        );
      }).length > 0
    ) {
      // We also want to wait for the bridging transaction to be mined
      // We do that by waiting for the nonce of the account we're using for bridging to increase
      // TODO: Makle this address more dynamic.
      const relayerNonce = await bridge.provider.getTransactionCount(this.relayerAddress, "pending");

      this.subscription.write({ vaaBytes: Buffer.from(vaa.slice(2), "hex") });
      let newRelayerNonce = -1;
      while (newRelayerNonce <= relayerNonce) {
        newRelayerNonce = await bridge.provider.getTransactionCount(this.relayerAddress, "pending");
      }

      tx = await MockBridgeMonitor.getTransactionFromAddressWithNonce(bridge.provider, this.relayerAddress, relayerNonce);
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
    const [bridge, sender, sequence, nonce, payload, consistencyLevel, wormholeChainID] = this.skipped.shift();
    const vaa = await this.encodeMockVAA(sender, sequence, nonce, payload, consistencyLevel, wormholeChainID);
    let tx;
    // If it passes the filter, send it
    if (
      this.subscriptionFilters.filter((f) => {
        return (
          f?.emitterFilter?.chainId === wormholeChainID && f?.emitterFilter?.emitterAddress === ethereumAddressToWormholeAddress(sender).slice(2)
        );
      }).length > 0
    ) {
      // We also want to wait for the bridging transaction to be mined
      // We do that by waiting for the nonce of the account we're using for bridging to increase
      const relayerNonce = await bridge.provider.getTransactionCount(this.relayerAddress, "pending");

      this.subscription.write({ vaaBytes: Buffer.from(vaa.slice(2), "hex") });

      let newRelayerNonce = -1;
      while (newRelayerNonce <= relayerNonce) {
        newRelayerNonce = await bridge.provider.getTransactionCount(this.relayerAddress, "pending");
      }

      tx = await MockBridgeMonitor.getTransactionFromAddressWithNonce(bridge.provider, this.relayerAddress, relayerNonce);
    }

    this.bridgingPromiseCount -= 1;

    if (this.bridgingPromiseCount === 0) {
      this.resolveBridgingPromise(tx);
    }
  }

  async waitUntilSkipped() {
    return new Promise<void>((resolve) => {
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
