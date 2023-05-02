const ethers = require("ethers");

const bridgeAbi = require("../build/contracts/BridgeMock.json").abi; // eslint-disable-line import/no-unresolved

class MockBridgeMonitor {
  /**
   * Constructor for (local) bridge monitor. Monitors specified bridge contracts that bridges
   * messages across in both directions. Does no validation or signing, so only to be used for
   * local development.
   * @param {string} homeRpc              The endpoint that the home chain can be queried on
   * @param {string} foreignRpc           The endpoint that the foreign chain can be queried on
   * @param {string} homeBridgeAddress    The address of the home bridge contract
   * @param {string} foreignBridgeAddress The address of the foreign bridge contract
   */
  constructor(homeRpc, foreignRpc, homeBridgeAddress, foreignBridgeAddress) {
    const providerHome = new ethers.providers.JsonRpcProvider(homeRpc).getSigner();
    const providerForeign = new ethers.providers.JsonRpcProvider(foreignRpc).getSigner();

    const homeBridge = new ethers.Contract(homeBridgeAddress, bridgeAbi, providerHome);
    const foreignBridge = new ethers.Contract(foreignBridgeAddress, bridgeAbi, providerForeign);

    this.skipCount = 0;

    this.skipped = [];

    homeBridge.on("UserRequestForSignature", async (messageId, encodedData) => {
      if (this.skipCount > 0) {
        this.skipCount -= 1;
        this.skipped.push([foreignBridge, messageId, encodedData]);
        return;
      }
      const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);
      await foreignBridge.execute(target, data, gasLimit, messageId, sender);
      console.log("seen on home bridge");
    });

    foreignBridge.on("UserRequestForSignature", async (messageId, encodedData) => {
      if (this.skipCount > 0) {
        this.skipCount -= 1;
        this.skipped.push([homeBridge, messageId, encodedData]);
        return;
      }
      const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);

      const tx = await homeBridge.execute(target, data, gasLimit, messageId, sender, { gasLimit: gasLimit * 1.5 });
      try {
        const receipt = await tx.wait();

        // console.log(receipt);
        const relayedEvent = receipt.events.filter((e) => e.event === "RelayedMessage")[0];
        if (!relayedEvent.args.status) {
          console.log("WARNING: Bridged transaction failed");
        }
      } catch (err) {
        console.log(err);
      }
      console.log("seen on foreign bridge");
      console.log("bridging transaction on home chain", tx.hash);
    });

    console.log("Mock Bridge Monitor running");
    console.log("Home bridge address: ", homeBridgeAddress);
    console.log("Foreign bridge address: ", foreignBridgeAddress);
  }

  close() {} // eslint-disable-line class-methods-use-this

  async bridgeSkipped() {
    const [bridge, messageId, encodedData] = this.skipped.shift();
    const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);
    const tx = await bridge.execute(target, data, gasLimit, messageId, sender);
    await tx.wait();
    console.log("bridged pending request");
  }

  reset() {
    this.skipCount = 0;
    this.skipped = [];
  }
}

module.exports = MockBridgeMonitor;
