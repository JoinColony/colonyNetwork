const ethers = require("ethers");

const bridgeAbi = require("../build/contracts/BridgeMock.json").abi; // eslint-disable-line import/no-unresolved

class BridgeMonitor {
  /**
   * Constructor for MetatransactionBroadcaster
   * @param {string} privateKey              The private key of the address that executes the metatransactions
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   */
  constructor(homeRPC, foreignRPC, homeBridgeAddress, foreignBridgeAddress) {
    const providerHome = new ethers.providers.JsonRpcProvider(homeRPC).getSigner();
    const providerForeign = new ethers.providers.JsonRpcProvider(foreignRPC).getSigner();

    const homeBridge = new ethers.Contract(homeBridgeAddress, bridgeAbi, providerHome);
    const foreignBridge = new ethers.Contract(foreignBridgeAddress, bridgeAbi, providerForeign);

    homeBridge.on("UserRequestForSignature", async (messageId, encodedData) => {
      const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);
      const tx = await foreignBridge.execute(target, data, gasLimit, messageId, sender);
      console.log("Bridging tx", tx);
    });

    console.log("Bridge Monitor running");
  }

  close() {} // eslint-disable-line class-methods-use-this
}

module.exports = BridgeMonitor;
