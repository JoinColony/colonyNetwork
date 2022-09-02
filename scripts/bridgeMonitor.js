const ethers = require("ethers");

const providerHome = new ethers.providers.JsonRpcProvider(`http://localhost:8545`).getSigner();
const providerForeign = new ethers.providers.JsonRpcProvider(`http://localhost:8546`).getSigner();
const homeBridgeAbi = require("../build/contracts/HomeBridgeMock.json").abi;
const foreignBridgeAbi = require("../build/contracts/ForeignBridgeMock.json").abi;

class BridgeMonitor {
  /**
   * Constructor for MetatransactionBroadcaster
   * @param {string} privateKey              The private key of the address that executes the metatransactions
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   */
  constructor(homeBridgeAddress, foreignBridgeAddress) {
    const homeBridge = new ethers.Contract(homeBridgeAddress, homeBridgeAbi, providerHome);
    const foreignBridge = new ethers.Contract(foreignBridgeAddress, foreignBridgeAbi, providerForeign);
    homeBridge.on("UserRequestForSignature", async (messageId, encodedData) => {
      const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);
      const tx = await foreignBridge.execute(target, data, gasLimit, messageId, sender);
      console.log(tx);
    });
    console.log("Bridge Monitor running");
  }
}

module.exports = BridgeMonitor;
