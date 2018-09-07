/* eslint-env jest */

import NetworkLoader from "../NetworkLoader";
import EtherRouter from "../../contracts/static/EtherRouter.json";

describe("colony-contract-loader-network - NetworkLoader", () => {
  const loader = new NetworkLoader({ network: "rinkeby" });
  const contractAddress = "0x7da82c7ab4771ff031b66538d2fb9b0b047f6cf9";

  test("It should load a static contract that is defined", async () => {
    const contract = await loader.load({ contractName: "EtherRouter", contractAddress });
    expect(contract).toHaveProperty("abi", expect.any(Array));
    expect(contract).toHaveProperty("address", contractAddress);
  });

  test("It should load an older versioned contract that is defined", async () => {
    const contract = await loader.load({ contractName: "IColony", contractAddress, version: "1" });
    expect(contract).toHaveProperty("abi", expect.any(Array));
    expect(contract).toHaveProperty("address", contractAddress);
  });

  test("It should load the latest versioned contract that is defined", async () => {
    const contract = await loader.load({ contractName: "IColony", contractAddress, version: "2" });
    expect(contract).toHaveProperty("abi", expect.any(Array));
    expect(contract).toHaveProperty("address", contractAddress);
  });

  test("It should load a versioned router contract that is defined, without an address or version", async () => {
    const contract = await loader.load({
      contractName: "IColonyNetwork",
      routerName: "EtherRouter"
    });
    expect(contract).toHaveProperty("abi", expect.any(Array));
    expect(contract).toHaveProperty("address", EtherRouter.networks.rinkeby.address);
  });

  test("It should not load a versioned router contract that is not defined on the selected network", async () => {
    const mainLoader = new NetworkLoader({ network: "main" });
    try {
      await mainLoader.load({
        contractName: "IColonyNetwork",
        routerName: "EtherRouter"
      });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("Contract IColonyNetwork with version 2 not found in main");
    }
  });

  test("It should fail to load a contract that does not exist", async () => {
    try {
      await loader.load({ contractName: "CryptoKitty", contractAddress });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("Contract CryptoKitty with version 2 not found in rinkeby");
    }
  });

  test("It should fail to load a contract for a version that does not exist", async () => {
    try {
      await loader.load({ contractName: "IColony", contractAddress, version: "420" });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("Contract IColony with version 420 not found in rinkeby");
    }
  });

  test("It should fail to load a contract for a network that does not exist", async () => {
    const ropstenLoader = new NetworkLoader({ network: "ropsten" });
    try {
      await ropstenLoader.load({ contractName: "IColony", contractAddress, version: "1" });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("Contract IColony with version 1 not found in ropsten");
    }
  });

  test("It should fail to load a contract without a contractName", async () => {
    try {
      await loader.load({ contractAddress, version: "1" });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("A `contractName` option must be provided");
    }
  });

  test("It should fail to load a contract without a version", async () => {
    try {
      await loader.load({ contractName: "IColony", contractAddress, version: null });
      expect(false).toBe(true); // should be unreachable
    } catch (error) {
      expect(error.toString()).toMatch("A valid `version` option must be provided");
    }
  });
});
