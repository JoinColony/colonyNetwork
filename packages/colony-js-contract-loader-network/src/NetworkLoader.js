import assert from "assert";
import ContractLoader, { truffleTransform } from "@colony/colony-js-contract-loader";

import config from "../config.json";

const NETWORKS = ["rinkeby"];
const { LATEST_VERSION, VERSIONS } = config;
const VERSIONED_CONTRACT_NAMES = ["IColony", "IColonyNetwork", "Authority"];
const STATIC_CONTRACT_NAMES = ["EtherRouter", "Token"];

const STATIC_CONTRACTS = Object.assign(
  {},
  ...STATIC_CONTRACT_NAMES.map(contract => ({
    // eslint-disable-next-line global-require, import/no-dynamic-require
    [contract]: require(`../contracts/static/${contract}.json`)
  }))
);

const VERSIONED_CONTRACTS = {};
// Define versioned contracts
NETWORKS.forEach(network => {
  VERSIONED_CONTRACT_NAMES.forEach(contract => {
    VERSIONED_CONTRACTS[contract] = {};
    if (!VERSIONED_CONTRACTS[contract][network]) {
      VERSIONED_CONTRACTS[contract][network] = {};
    }
    VERSIONS.forEach(version => {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      VERSIONED_CONTRACTS[contract][network][version] = require(`../contracts/versioned/${network}-v${version}/${contract}.json`);
    });
  });
});

class NetworkLoader extends ContractLoader {
  constructor({ network = "main" } = {}) {
    super({ transform: truffleTransform });
    this._network = network;
  }

  async _load(query = {}, requiredProps) {
    const { contractName = "", version = LATEST_VERSION } = query;
    const networkQuery = Object.assign({}, query, { network: this._network });

    assert(!!contractName, "A `contractName` option must be provided");
    assert(!!version, "A valid `version` option must be provided");

    if (STATIC_CONTRACTS[contractName]) {
      return this._transform(STATIC_CONTRACTS[contractName], networkQuery, requiredProps);
    }
    if (
      VERSIONED_CONTRACTS[contractName] &&
      VERSIONED_CONTRACTS[contractName][this._network] &&
      VERSIONED_CONTRACTS[contractName][this._network][version]
    ) {
      return this._transform(VERSIONED_CONTRACTS[contractName][this._network][version], networkQuery, requiredProps);
    }
    throw new Error(`Contract ${contractName} with version ${version} not found in ${this._network}`);
  }
}

module.exports = NetworkLoader;
