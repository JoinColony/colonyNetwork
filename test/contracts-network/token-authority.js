/* globals artifacts */
const chai = require("chai");
const bnChai = require("bn-chai");

const { setupRandomColony } = require("../../helpers/test-data-generator");
const { ADDRESS_ZERO } = require("../../helpers/constants");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const EtherRouter = artifacts.require("EtherRouter");
const IColonyNetwork = artifacts.require("IColonyNetwork");
const TokenAuthority = artifacts.require("TokenAuthority");

contract("Token Authority", (addresses) => {
  let token;
  let colonyNetwork;
  let colony;

  let tokenAuthority;

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    tokenAuthority = await TokenAuthority.new(token.address, colony.address, []);
  });

  describe("token authority allowed behaviours", async () => {
    it("should allow anyone to burn their tokens", async () => {
      let allowed = await tokenAuthority.canCall(addresses[0], token.address, web3.utils.soliditySha3("burn(uint256)").slice(0, 10));
      expect(allowed).to.equal(true);
      allowed = await tokenAuthority.canCall(addresses[0], token.address, web3.utils.soliditySha3("burn(address,uint256)").slice(0, 10));
      expect(allowed).to.equal(true);
    });

    it("should return false if the destination is anything other than the token address", async () => {
      const allowed = await tokenAuthority.canCall(addresses[0], ADDRESS_ZERO, web3.utils.soliditySha3("something").slice(0, 10));
      expect(allowed).to.equal(false);
    });
  });
});
