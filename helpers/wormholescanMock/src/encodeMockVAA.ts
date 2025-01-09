import { ethers, Contract } from "ethers";

function ethereumAddressToWormholeAddress(address: string) {
  return ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(ethers.utils.hexlify(address)), 32);
}

export default async function encodeMockVAA(
  sender: string,
  sequence: number,
  nonce: number,
  payload: string,
  consistencyLevel: number,
  chainId: number,
  homeBridgeAddress: string,
  homeBridgeProvider: ethers.providers.Provider,
) {
  const homeBridge = new Contract(
    homeBridgeAddress,
    ["function buildVAABody(uint32,uint32,uint16,bytes32,uint64,uint8,bytes) view returns(bytes)"],
    homeBridgeProvider,
  );
  const timestamp = Math.floor(Date.now() / 1000);
  const emitterChainId = chainId;
  const emitterAddress = ethereumAddressToWormholeAddress(sender);

  const vaaBody = await homeBridge.buildVAABody(timestamp, nonce, emitterChainId, emitterAddress, sequence, consistencyLevel, payload);

  const vaaHeader =
    "0x01" + // version
    "00000000" + // guardianSetIndex
    "01" + // signature count
    "01" + // signature index
    "7777000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007777";

  return vaaHeader + vaaBody.toString("hex").slice(2);
}
