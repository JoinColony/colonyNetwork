const wormhole = require("@certusone/wormhole-sdk");

module.exports = {
  chains: {
    [wormhole.CHAIN_ID_ARBITRUM_SEPOLIA]: {
      endpoints: ["http://localhost:8545"],
      colonyBridgeAddress: "0x633899227A3BC1f79de097149E1E3C8097c07b1a",
    },
    [wormhole.CHAIN_ID_SEPOLIA]: {
      endpoints: ["http://localhost:8546"],
      colonyBridgeAddress: "0x161944B5601a7d3004E20d4Ca823F710838Ea1be",
    },
  },
};
