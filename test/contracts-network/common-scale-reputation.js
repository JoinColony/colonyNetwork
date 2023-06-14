/* globals artifacts */

const chai = require("chai");
const bnChai = require("bn-chai");

const { INT256_MAX, INT256_MIN, INT128_MIN, INT128_MAX, WAD } = require("../../helpers/constants");

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const ScaleReputationTest = artifacts.require("ScaleReputationTest");

contract("ScaleReputation", () => {
  let scaleReputationTest;

  before(async () => {
    scaleReputationTest = await ScaleReputationTest.new();
  });

  describe("when scaling reputation", () => {
    it("should scale reputation up", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(100, WAD.muln(2));
      expect(scaled).to.eq.BN(200);
    });

    it("should scale reputation down", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(100, WAD.divn(2));
      expect(scaled).to.eq.BN(50);
    });

    it("should cap negatively", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT128_MAX.subn(10), WAD.muln(2));
      expect(scaled).to.eq.BN(INT128_MAX);
    });

    it("should cap positively", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT128_MIN.addn(10), WAD.muln(2));
      expect(scaled).to.eq.BN(INT128_MIN);
    });

    it("deal with calculations that would arithmetically overflow", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT256_MAX.subn(10), WAD.subn(1));
      expect(scaled).to.eq.BN(INT128_MAX);
    });

    it("deal with calculations that would arithmetically underflow", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT256_MIN.addn(10), WAD.subn(1));
      expect(scaled).to.eq.BN(INT128_MIN);
    });

    it("deal with calculations that exceed our reputation cap during calculation, but not once calculation is complete", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT128_MIN.addn(10), WAD.subn(1));
      expect(scaled).to.be.gt.BN(INT128_MIN);
    });

    it("deal with calculations that exceed our reputation cap during calculation, but not once calculation is complete", async () => {
      const scaled = await scaleReputationTest.scaleReputationPublic(INT128_MAX.subn(10), WAD.subn(1));
      expect(scaled).to.be.lt.BN(INT128_MAX);
    });
  });
});
