const assert = require("assert");
const path = require("path");
const jsonfile = require("jsonfile");

const DEFAULT_REQUIRED_CONTRACT_PROPS = {
  abi: true,
  address: false,
  bytecode: false,
};

const validateField = (assertion, field) => assert(assertion, `Invalid contract definition: ${field} is missing or invalid`);

export default class TruffleContractLoader {
  static transform({ abi = [], bytecode, networks = {} } = {}, { network } = {}) {
    let address;

    // Some clients (like Ganache) create IDs as integers; normalise them
    const networkKeys = Object.keys(networks).map((id) => `${id}`);

    if (network && networkKeys.length) {
      if (!networks[network]) throw new Error(`Network ID ${network} not found in contract`);
      ({ address } = networks[network]);
    } else {
      // Pick the last network (assumed to be the most recent)
      ({ address } = networks[networkKeys[networkKeys.length - 1]] || {});
    }

    return {
      abi,
      address,
      bytecode,
    };
  }

  static validateContractDefinition(contractDef, requiredProps) {
    assert(Object.getOwnPropertyNames(contractDef).length > 0, "Missing contract definition");

    const { address, abi } = contractDef;

    if (requiredProps.address) validateField(typeof address === "string" && address.length > 0, "address");

    if (requiredProps.bytecode) validateField(typeof contractDef.bytecode === "string" && contractDef.bytecode.length > 0, "bytecode");

    if (requiredProps.abi) validateField(Array.isArray(abi) && abi.length > 0, "abi");

    return true;
  }

  constructor({ contractDir } = {}) {
    assert(typeof contractDir === "string" && contractDir, "A `contractDir` option must be provided");
    this._contractDir = contractDir;
  }

  async _load(query = {}) {
    const { contractName = "" } = query;

    assert(!!contractName, "A `contractName` option must be provided");

    const file = path.resolve(this._contractDir, `${contractName}.json`);
    return new Promise((resolve, reject) => {
      jsonfile.readFile(file, (error, contents) => {
        let transformed;
        if (error) return reject(error);
        try {
          transformed = this.constructor.transform(contents, query);
        } catch (transformError) {
          return reject(transformError);
        }
        return resolve(transformed);
      });
    });
  }

  async load(query, requiredProps = DEFAULT_REQUIRED_CONTRACT_PROPS) {
    const { contractName, contractAddress, routerName, routerAddress, ...otherQuery } = query;

    if (!(contractName || contractAddress)) throw new TypeError("The field `contractName` or `contractAddress` must be supplied");

    // Load the contract definition by either the contract name or address
    const firstQuery = {
      ...(contractName ? { contractName } : { contractAddress }),
      ...otherQuery,
    };
    const result = await this._load(firstQuery);

    if (result == null) throw new Error(`Unable to load contract definition (${JSON.stringify(firstQuery)})`);

    if (contractAddress) {
      // If we have a specific contractAddress, set it directly.
      result.address = contractAddress;
    } else if (routerAddress) {
      // If we have the router address, set it directly.
      result.address = routerAddress;
    } else if (routerName) {
      // If we have the router name, look it up for the router address.
      const routerContract = await this._load({
        ...otherQuery,
        contractName: routerName,
      });
      if (routerContract != null) result.address = routerContract.address;
    }

    this.constructor.validateContractDefinition(result, requiredProps);

    return result;
  }
}
