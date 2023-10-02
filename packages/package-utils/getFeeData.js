const ethers = require("ethers");
const axios = require("axios");

/**
 * Update the gas estimate
 * @param  {string}  Transaction speed (fastest, fast, safeLow)
 * @param  {number}  Chain ID
 * @param  {object}  Adapter
 * @param  {object}  Provider
 * @return {Promise}
 */
const getFeeData = async function (_type, chainId, adapter, provider) {
  let defaultGasPrice;
  let factor;
  let feeData;

  let type = _type;
  const options = {
    headers: {
      "User-Agent": "Request-Promise",
    },
    json: true, // Automatically parses the JSON string in the response
  };

  if (chainId === 100) {
    options.url = "https://blockscout.com/xdai/mainnet/api/v1/gas-price-oracle";
    defaultGasPrice = ethers.BigNumber.from(2000000000);
    factor = 1;
    // This oracle presents the information slightly differently from ethgasstation.
    if (_type === "safeLow") {
      type = "slow";
    }
  } else if (chainId === 1) {
    options.url = "https://ethgasstation.info/json/ethgasAPI.json";
    defaultGasPrice = ethers.BigNumber.from(2000000000);
    factor = 10;
  } else {
    // We don't have an oracle, so just use the provided fee data
    adapter.log(`During gas estimation: unknown chainid ${chainId}`);
    feeData = await provider.getFeeData();
    delete feeData.lastBaseFeePerGas;
    if (feeData.maxFeePerGas) {
      delete feeData.gasPrice;
    }
    return feeData;
  }

  try {
    feeData = await provider.getFeeData();
    delete feeData.lastBaseFeePerGas;
    // Update gas prices from whichever oracle
    try {
      const request = await axios.request(options);
      const gasEstimates = request.data;

      if (feeData.maxFeePerGas) {
        // Update the EIP1559 fee data based on the type
        const ratio = gasEstimates[type] / gasEstimates.average;
        // Increase the priority fee by this ratio
        const newMaxPriorityFeePerGas = ethers.BigNumber.from(Math.floor(feeData.maxPriorityFeePerGas * 1000))
          .mul(Math.floor(ratio * 1000))
          .div(1000 * 1000);
        // Increase the max fee per gas by the same amount (not the same ratio)
        feeData.maxFeePerGas = feeData.maxFeePerGas.add(newMaxPriorityFeePerGas).sub(feeData.maxPriorityFeePerGas);
        feeData.maxPriorityFeePerGas = newMaxPriorityFeePerGas;
        delete feeData.gasPrice;
        return feeData;
      }

      // If we get here, chain is not EIP1559, so just update gasPrice
      if (gasEstimates[type]) {
        feeData.gasPrice = ethers.BigNumber.from(gasEstimates[type] * 1e9).div(factor);
      } else {
        feeData.gasPrice = defaultGasPrice;
      }
    } catch (err) {
      adapter.error(`Error during gas estimation: ${err}`);
      feeData = { gasPrice: defaultGasPrice };
    }
  } catch (err) {
    adapter.error(err);
    feeData = { gasPrice: defaultGasPrice };
  }
  return feeData;
};

module.exports = getFeeData;
