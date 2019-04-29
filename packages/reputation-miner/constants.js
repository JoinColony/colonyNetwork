import { ethers } from "ethers";

export const MIN_STAKE = ethers.constants.WeiPerEther.mul(2000);
export const MINING_CYCLE_DURATION = 60 * 60 * 24; // 24 hours
