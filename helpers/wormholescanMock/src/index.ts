import express, { Express, Request, Response } from "express";
import { LogDescription } from "ethers/lib/utils";
import { ethers } from "ethers";
import { OperationsOperationResponse, VaaChainID } from "../openapi-generated-types/models";
import encodeMockVAA from "./encodeMockVAA";

const app: Express = express();
const port = process.env.PORT || 3000;
const providerURLs: string[] = process.env.PROVIDER_URLS ? process.env.PROVIDER_URLS.split(",") : [];

const providers: ethers.providers.JsonRpcProvider[] = [];

function wormholeAddressToEvmAddress(address: string): string {
  return ethers.utils.getAddress(`0x${address.slice(26, 66)}`);
}

function evmChainIdToWormholeChainId(chainId: number) {
  // So I've decreed that for chainId 265669100, we use 10003 (which is really arbitrum sepolia)
  // and for chainId 265669101, we use 10002 (which is really sepolia).

  switch (chainId) {
    case 265669100:
      return 10003;
    case 265669101:
      return 10002;
    case 265669102:
      return 10004;
    default:
      throw new Error("Invalid chainId");
  }
}

type LogAndEvent = {
  log: ethers.providers.Log;
  event: LogDescription;
  chainId?: VaaChainID;
};

async function getLogMessagePublishedForVAA(
  provider: ethers.providers.Provider,
  emitterWormholeChainId: number,
  wormholeSender: string,
  sequence: string,
): Promise<LogAndEvent | undefined> {
  const providerChainId = (await provider.getNetwork()).chainId;
  const providerWormholeChainId = await evmChainIdToWormholeChainId(providerChainId);
  if (providerWormholeChainId !== emitterWormholeChainId) {
    return;
  }
  const logs = await provider.getLogs({
    topics: [ethers.utils.id("LogMessagePublished(address,uint64,uint32,bytes,uint8)"), wormholeSender],
    fromBlock: 1,
  });

  if (logs.length === 0) {
    return;
  }

  const wormhole = new ethers.Contract(
    logs[0].address,
    ["event LogMessagePublished(address indexed sender,uint64 sequence,uint32 nonce,bytes payload,uint8 consistencyLevel)"],
    provider,
  );

  const logsAndEvents = logs.map((log) => {
    return { log, event: wormhole.interface.parseLog(log) } as LogAndEvent;
  });

  const filteredLogsAndEvents = logsAndEvents.filter(
    (logAndEvent) =>
      logAndEvent.event.args.sequence.toString() === sequence &&
      ethers.utils.getAddress(logAndEvent.event.args.sender) === wormholeAddressToEvmAddress(wormholeSender),
  );

  if (filteredLogsAndEvents.length === 0) {
    return;
  }
  const requestingEventAndLog = filteredLogsAndEvents[0];

  const { chainId } = await provider.getNetwork();
  requestingEventAndLog.chainId = evmChainIdToWormholeChainId(chainId);
  return requestingEventAndLog; // eslint-disable-line consistent-return
}

async function getColonyReceivingTransaction(
  provider: ethers.providers.Provider,
  emitterWormholeChainId: number,
  emitterWormholeAddress: string,
  sequence: string,
): Promise<LogAndEvent | undefined> {
  const logs = await provider.getLogs({
    topics: [ethers.utils.id("WormholeMessageReceived(uint16,bytes32,uint64)")],
  });

  if (logs.length === 0) {
    return;
  }
  const wormhole = new ethers.Contract(
    logs[0].address,
    ["event WormholeMessageReceived(uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence)"],
    provider,
  );

  const logsAndEvents = logs.map((log) => {
    return { log, event: wormhole.interface.parseLog(log) } as LogAndEvent;
  });

  const filteredLogsAndEvents = logsAndEvents.filter(
    (logAndEvent: LogAndEvent) =>
      logAndEvent.event.args?.sequence.toString() === sequence &&
      logsAndEvents[0].event.args.emitterAddress === emitterWormholeAddress &&
      logAndEvent.event.args?.emitterChainId === emitterWormholeChainId,
  );

  if (filteredLogsAndEvents.length === 0) {
    return;
  }
  const receivingEventAndLog = filteredLogsAndEvents[0];

  const { chainId } = await provider.getNetwork();
  const wormholeChainId = await evmChainIdToWormholeChainId(chainId);
  receivingEventAndLog.chainId = wormholeChainId;
  return receivingEventAndLog; // eslint-disable-line consistent-return
}

app.get("/api/v1/operations/:chain/:emitter/:sequence", async (req: Request, res: Response) => {
  // TODO: get provider based on :chain
  // Emitter must be a valid _Wormhole_ address
  // Which is length 64 and valid hex
  let emitterAddress = req.params.emitter;
  if (req.params.emitter.substring(0, 2) !== "0x") {
    emitterAddress = `0x${req.params.emitter}`;
  }
  emitterAddress = emitterAddress.toLowerCase();
  if (!ethers.utils.isHexString(emitterAddress) || emitterAddress.length !== 66) {
    res.status(400).send({
      code: 3,
      message: "MALFORMED EMITTER_ADDR",
    });
    return;
  }

  let requestingEventAndLog;
  let relevantProvider;
  for (const provider of providers) {
    requestingEventAndLog = await getLogMessagePublishedForVAA(provider, parseInt(req.params.chain, 10), emitterAddress, req.params.sequence);
    if (requestingEventAndLog) {
      relevantProvider = provider;
      break;
    }
  }

  if (!requestingEventAndLog) {
    res.status(404).send({
      code: 1,
      message: "VAA NOT FOUND",
    });
    return;
  }

  let receivingEventAndLog;
  for (const provider of providers) {
    receivingEventAndLog = await getColonyReceivingTransaction(provider, parseInt(req.params.chain, 10), emitterAddress, req.params.sequence);
    if (receivingEventAndLog) {
      break;
    }
  }

  const body: OperationsOperationResponse = {
    id: `${req.params.chain}/${req.params.emitter}/${req.params.sequence}`,
    sourceChain: {
      chainId: requestingEventAndLog.chainId,
      transaction: {
        txHash: requestingEventAndLog.log.transactionHash,
      },
      status: "confirmed",
    },
  };

  const signed = true;
  if (signed) {
    const rawVAA = await encodeMockVAA(
      emitterAddress,
      parseInt(req.params.sequence, 10),
      0,
      requestingEventAndLog.event.args.payload,
      0,
      parseInt(req.params.chain, 10),
      requestingEventAndLog.log.address,
      relevantProvider,
    );
    body.vaa = { raw: rawVAA };
  }

  if (receivingEventAndLog) {
    body.targetChain = {
      chainId: receivingEventAndLog.chainId,
      transaction: {
        txHash: receivingEventAndLog.log.transactionHash,
      },
      status: "confirmed",
    };
  }

  res.send(body);
});

app.listen(port, async () => {
  for (const providerURL of providerURLs) {
    const p = new ethers.providers.JsonRpcProvider(providerURL);
    try {
      await p.getNetwork();
      providers.push(p);
    } catch (e) {
      console.error(`Failed to connect to provider ${providerURL} with error ${e}, skipping`);
    }
  }

  console.log(`[server]: Server is running at http://localhost:${port}`);
});
