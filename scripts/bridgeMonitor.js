const ethers = require("ethers");

const providerHome = new ethers.providers.JsonRpcProvider(`http://localhost:8545`).getSigner();
const providerForeign = new ethers.providers.JsonRpcProvider(`http://localhost:8546`).getSigner();
const homeBridgeAbi = require("../build/contracts/HomeBridgeMock.json").abi; // eslint-disable-line import/no-unresolved
const foreignBridgeAbi = require("../build/contracts/ForeignBridgeMock.json").abi; // eslint-disable-line import/no-unresolved
const erc721Abi = require("../build/contracts/ERC721Mock.json").abi; // eslint-disable-line import/no-unresolved
const tokenAbi = require("../build/contracts/Token.json").abi; // eslint-disable-line import/no-unresolved
const zodiacBridgeModuleAbi = require("../build/contracts/ZodiacBridgeModuleMock.json").abi; // eslint-disable-line import/no-unresolved

class BridgeMonitor {
  /**
   * Constructor for MetatransactionBroadcaster
   * @param {string} privateKey              The private key of the address that executes the metatransactions
   * @param {Object} loader                  The loader for loading the contract interfaces. Usually a TruffleLoader.
   * @param {Object} provider                Ethers provider that allows access to an ethereum node.
   */
  constructor(homeBridgeAddress, foreignBridgeAddress, erc721Address, tokenAddress, zodiacBridgeModuleAddress) {
    const homeBridge = new ethers.Contract(homeBridgeAddress, homeBridgeAbi, providerHome);
    const foreignBridge = new ethers.Contract(foreignBridgeAddress, foreignBridgeAbi, providerForeign);
    const erc721 = new ethers.Contract(erc721Address, erc721Abi, providerForeign);
    const token = new ethers.Contract(tokenAddress, tokenAbi, providerForeign);
    const zodiacBridgeModule = new ethers.Contract(zodiacBridgeModuleAddress, zodiacBridgeModuleAbi, providerForeign);

    homeBridge.on("UserRequestForSignature", async (messageId, encodedData) => {
      const [target, data, gasLimit, sender] = ethers.utils.defaultAbiCoder.decode(["address", "bytes", "uint256", "address"], encodedData);
      const tx = await foreignBridge.execute(target, data, gasLimit, messageId, sender);
      console.log(tx);
    });

    erc721.on("Transfer", async (from, to, tokenId) => {
      console.log(`Token #${tokenId} transfered from ${from} to ${to}`);
      if (from !== ethers.constants.AddressZero) {
        const remaining = await erc721.balanceOf(from);
        console.log(`Safe ${from} now contains ${remaining} NFT(s).`);
      }
    });

    token.on("Transfer", async (from, to, amount) => {
      console.log(`Transfered ${amount} tokens from ${from} to ${to}`);
      if (from !== ethers.constants.AddressZero) {
        const remaining = await token.balanceOf(from);
        console.log(`Safe ${from} now contains ${remaining} tokens.`);
      }
    });

    zodiacBridgeModule.on("SafeTransactionExecuted", async (success) => {
      console.log("Safe tx successfully executed by Zodiac module:", success);
    });

    console.log("Bridge Monitor running");
  }

  close() {} // eslint-disable-line class-methods-use-this
}

module.exports = BridgeMonitor;
