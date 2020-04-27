/* globals artifacts */
import chai from "chai";
import bnChai from "bn-chai";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColony = artifacts.require("IColony");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const ERC20PresetMinterPauser = artifacts.require("ERC20PresetMinterPauser");

contract("Colony Token Integration", (addresses) => {
  let colony;
  let erc20Mintable;
  let colonyNetwork;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    // Instantiate an openzeppelin ERC20Mintable token instance
    erc20Mintable = await ERC20PresetMinterPauser.new("Test", "TEST");
    const { logs } = await colonyNetwork.createColony(erc20Mintable.address, 0, "", "", false);
    const { colonyAddress } = logs[0].args;
    colony = await IColony.at(colonyAddress);
    await colony.setRewardInverse(100);
  });

  describe("when working with openzeppelin-solidity/ERC20Mintable token", () => {
    it("should be able to correctly claim tokens in the colony funding pots", async () => {
      await erc20Mintable.mint(colony.address, 100);

      let colonyRewardPotBalance = await colony.getFundingPotBalance(0, erc20Mintable.address);
      let colonyPotBalance = await colony.getFundingPotBalance(1, erc20Mintable.address);
      let colonyTokenBalance = await erc20Mintable.balanceOf(colony.address);
      expect(colonyRewardPotBalance).to.be.zero;
      expect(colonyPotBalance).to.be.zero;
      expect(colonyTokenBalance).to.be.eq.BN(100);

      await colony.claimColonyFunds(erc20Mintable.address);

      colonyRewardPotBalance = await colony.getFundingPotBalance(0, erc20Mintable.address);
      colonyPotBalance = await colony.getFundingPotBalance(1, erc20Mintable.address);
      colonyTokenBalance = await erc20Mintable.balanceOf(colony.address);
      expect(colonyRewardPotBalance).to.be.eq.BN(1);
      expect(colonyPotBalance).to.be.eq.BN(99);
      expect(colonyTokenBalance).to.be.eq.BN(100);
    });
  });

  describe("when working with openzeppelin-solidity/ERC20Mintable token owned by the colony", () => {
    beforeEach(async () => {
      await erc20Mintable.grantRole(web3.utils.soliditySha3("MINTER_ROLE"), colony.address);
      await erc20Mintable.renounceRole(web3.utils.soliditySha3("MINTER_ROLE"), addresses[0]);
      // At the point the only permitted address to mint tokens is the colony
    });

    it("should be able to correctly claim tokens in the colony funding pots", async () => {
      await colony.mintTokens(100);

      let colonyRewardPotBalance = await colony.getFundingPotBalance(0, erc20Mintable.address);
      let colonyPotBalance = await colony.getFundingPotBalance(1, erc20Mintable.address);
      let colonyTokenBalance = await erc20Mintable.balanceOf(colony.address);
      expect(colonyRewardPotBalance).to.be.zero;
      expect(colonyPotBalance).to.be.zero;
      expect(colonyTokenBalance).to.be.eq.BN(100);

      await colony.claimColonyFunds(erc20Mintable.address);

      colonyRewardPotBalance = await colony.getFundingPotBalance(0, erc20Mintable.address);
      colonyPotBalance = await colony.getFundingPotBalance(1, erc20Mintable.address);
      colonyTokenBalance = await erc20Mintable.balanceOf(colony.address);
      expect(colonyRewardPotBalance).to.be.eq.BN(1);
      expect(colonyPotBalance).to.be.eq.BN(99);
      expect(colonyTokenBalance).to.be.eq.BN(100);
    });
  });
});
