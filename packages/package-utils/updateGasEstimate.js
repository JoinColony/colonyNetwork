const ethers = require("ethers");
const axios = require("axios");

/**
 * Update the gas estimate
 * @param  {string}  Transaction speed (fastest, fast, safeLow)
 * @return {Promise}
 */
const updateGasEstimate = async function (_type, chainId, adapter) {
  let type = _type;
  const options = {
    headers: {
      "User-Agent": "Request-Promise",
    },
    json: true, // Automatically parses the JSON string in the response
  };
  let defaultGasPrice;
  let factor;

  if (chainId === 100) {
    options.url = "https://blockscout.com/xdai/mainnet/api/v1/gas-price-oracle";
    defaultGasPrice = ethers.utils.hexlify(1000000000);
    factor = 1;
    // This oracle presents the information slightly differently from ethgasstation.
    if (_type === "safeLow") {
      type = "slow";
    }
  } else if (chainId === 1) {
    options.url = "https://ethgasstation.info/json/ethgasAPI.json";
    defaultGasPrice = ethers.utils.hexlify(20000000000);
    factor = 10;
  } else {
    adapter.error(`Error during gas estimation: unknown chainid ${chainId}`);
    const gasPrice = ethers.utils.hexlify(20000000000);
    return gasPrice;
  }

  // Get latest from whichever oracle
  try {
    const gasEstimates = await axios.request(options);
    let gasPrice;
    if (gasEstimates[type]) {
      gasPrice = ethers.utils.hexlify((gasEstimates[type] / factor) * 1e9);
    } else {
      gasPrice = defaultGasPrice;
    }
    return gasPrice;
  } catch (err) {
    adapter.error(`Error during gas estimation: ${err}`);
    return defaultGasPrice;
  }
};

module.exports = updateGasEstimate;
