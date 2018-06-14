import assert from "assert";
import ContractLoader, { truffleTransform } from "@colony/colony-js-contract-loader";

import config from "../config.json";

const NETWORKS = ["rinkeby"];
const LATEST_VERSION = config.LATEST_CONTRACT_VERSION;
const VERSIONED_CONTRACTS = ["IColony", "IColonyNetwork", "Authority"];
const STATIC_CONTRACTS = ["EtherRouter", "Token"];

const CONTRACTS = {};
NETWORKS.forEach(network => {
  [...Array(LATEST_VERSION).keys()].forEach(version => {
    VERSIONED_CONTRACTS.forEach(contract => {
      CONTRACTS[contract] = {};
      if (!CONTRACTS[contract][network]) {
        CONTRACTS[contract][network] = {};
      }
      // eslint-disable-next-line global-require, import/no-dynamic-require
      CONTRACTS[contract][network][version + 1] = require(`../contracts/versioned/${network}-v${version + 1}/${contract}.json`);
    });
  });
});
STATIC_CONTRACTS.forEach(contract => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  CONTRACTS[contract] = require(`../contracts/static/${contract}.json`);
});

class NetworkLoader extends ContractLoader {
  constructor({ network = "main" } = {}) {
    super({ transform: truffleTransform });
    this._network = network;
  }
  async _load(query = {}, requiredProps) {
    const { contractName = "", version = LATEST_VERSION } = query;

    assert(!!contractName, "A `contractName` option must be provided");
    assert(!!version, "A valid `version` option must be provided");

    if (CONTRACTS[contractName] && CONTRACTS[contractName][this._network] && CONTRACTS[contractName][this._network][version]) {
      return this._transform(CONTRACTS[contractName][this._network][version], query, requiredProps);
    } else if (CONTRACTS[contractName]) {
      return this._transform(CONTRACTS[contractName], query, requiredProps);
    }
    throw new Error(`Contract ${contractName} with version ${version} not found in ${this._network}`);
  }
}

module.exports = NetworkLoader;
