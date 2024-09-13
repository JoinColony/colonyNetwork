import { Environment, StandardRelayerContext, RelayerApp, providers } from "@wormhole-foundation/relayer-engine";
import { CHAIN_ID_ARBITRUM_SEPOLIA, CHAIN_ID_SEPOLIA } from "@certusone/wormhole-sdk";

import * as path from "path";

import { ethers } from "ethers";

import { RetryProvider, TruffleLoader, ExtendedNonceManager as NonceManager } from "package-utils";

import config from "./config";

const loader = new TruffleLoader({
  contractRoot: path.resolve(__dirname, "..", "..", "artifacts", "contracts"),
});

// class TestStorage extends RedisStorage {
//   startWorker(cb: onJobHandler): void {
//     console.log("called start worker with", cb);
//   }

//   async stopWorker(): Promise<void> {}

//   async addVaaToQueue(vaa: SignedVaa): Promise<RelayJob> {
//     console.log("adding vaa to queue: ", vaa);
//     return {} as RelayJob;
//   }
// }

(async function main() {
  // initialize relayer engine app, pass relevant config options
  const app = new RelayerApp<StandardRelayerContext>(
    Environment.DEVNET,
    // other app specific config options can be set here for things
    // like retries, logger, or redis connection settings.
    // {
    //   name: "ExampleRelayer",
    //   providers: {
    //     chains: {
    //       [CHAIN_ID_ARBITRUM_SEPOLIA]: {
    //         endpoints: ["http://localhost:8545"],
    //       },
    //     },
    //   }
    // },
  );

  // const p = {
  //   chains: {
  //     [CHAIN_ID_ARBITRUM_SEPOLIA]: {
  //       endpoints: ["http://localhost:8545"],
  //     },
  //     [CHAIN_ID_SEPOLIA]: {
  //       endpoints: ["http://localhost:8546"],
  //     },
  //   },
  // }

  // Config
  // const store = new TestStorage({
  //   attempts: 3,
  //   namespace: "wormhole-relayer",
  //   queueName: "relays",
  // });

  app.spy("localhost:7073");
  // app.useStorage(store);
  // app.logger(console);

  // Set up middleware
  // app.use(logging(console)); // <-- logging middleware
  app.use(providers(config));
  // app.use(stagingArea());
  // app.use(sourceTx());

  // const colonyBridgeAddresses = {
  //   [CHAIN_ID_ARBITRUM_SEPOLIA]: "0x633899227A3BC1f79de097149E1E3C8097c07b1a",
  //   [CHAIN_ID_SEPOLIA]: "0x161944B5601a7d3004E20d4Ca823F710838Ea1be",
  // };

  const colonyBridges = {};
  const colonyBridgeContractDef = await loader.load({ contractDir: "bridging", contractName: "WormholeBridgeForColony" });
  const privateKey = "0xfe6066af949ec3c2c88ac10f47907c6d4e200c37b28b5af49e7d0ffd5c301c5c";
  for (const chainId of Object.keys(config.chains)) {
    const { colonyBridgeAddress } = config.chains[chainId];
    const providerAddress = config.chains[chainId].endpoints[0];
    const wallet = new ethers.Wallet(privateKey, new RetryProvider(providerAddress));

    // I think this type conversion is required because we are inheriting from a js file...
    // The noncemanager inherits Signer, so this is fine, practically
    const nonceManager = new NonceManager(wallet) as unknown as ethers.Signer;

    colonyBridges[chainId] = new ethers.Contract(colonyBridgeAddress, colonyBridgeContractDef.abi, nonceManager);
  }

  // add a filter with a callback that will be
  // invoked on finding a VAA that matches the filter

  const colonyBridgeAddresses: {
    [chainid: string]: string;
  } = {};

  Object.keys(config.chains).forEach(function (chainid) {
    colonyBridgeAddresses[chainid] = config.chains[chainid].colonyBridgeAddress;
  });

  app.multiple(colonyBridgeAddresses, async (ctx, next) => {
    const { vaa } = ctx;
    if (!vaa) {
      return next();
    }
    const hash = ctx.sourceTxHash;

    console.log(`Got a VAA with sequence: ${vaa.sequence} from with txhash: ${hash}`);

    let destinationBridge;

    if (vaa.emitterChain === CHAIN_ID_ARBITRUM_SEPOLIA) {
      destinationBridge = colonyBridges[CHAIN_ID_SEPOLIA];
    } else if (vaa.emitterChain === CHAIN_ID_SEPOLIA) {
      destinationBridge = colonyBridges[CHAIN_ID_ARBITRUM_SEPOLIA];
    } else {
      console.log("Unknown chain", vaa.emitterChain);
      return next();
    }

    try {
      // TODO: Explicit gas limit is a nod to tests...
      const tx = await destinationBridge.receiveMessage(ctx.vaaBytes, { gasLimit: 1000000 });
      await tx.wait();
      console.log(`bridged with txhash${tx.hash}`);
    } catch (err) {
      console.log("ERROR", err);
      console.log("trying estimate gas with", err.transaction.to, err.transaction.data);
      try {
        const errEst = await destinationBridge.provider.estimateGas({
          to: err.transaction.to,
          data: err.transaction.data,
        });
        console.log("errEst", errEst.toString());
      } catch (err2) {
        console.log("ERROR2", err2);
      }
    }

    return next();
  });

  // add and configure any other middleware ..

  // start app, blocks until unrecoverable error or process is stopped
  await app.listen();
})();
