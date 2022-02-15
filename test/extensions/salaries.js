/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import { ethers } from "ethers";
import { soliditySha3 } from "web3-utils";

import { UINT256_MAX, WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { checkErrorRevert, forwardTime, web3GetCode, makeTxAtTimestamp, getBlockTime } from "../../helpers/test-helper";
import { setupRandomColony, fundColonyWithTokens, getMetaTransactionParameters } from "../../helpers/test-data-generator";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const IColonyNetwork = artifacts.require("IColonyNetwork");
const IMetaColony = artifacts.require("IMetaColony");
const EtherRouter = artifacts.require("EtherRouter");
const Salaries = artifacts.require("Salaries");

const SALARIES = soliditySha3("Salaries");

contract.only("Salaries", (accounts) => {
  let colonyNetwork;
  let colony;
  let token;
  let salaries;
  let version;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  before(async () => {
    const etherRouter = await EtherRouter.deployed();
    colonyNetwork = await IColonyNetwork.at(etherRouter.address);

    const metaColonyAddress = await colonyNetwork.getMetaColony();
    const metacolony = await IMetaColony.at(metaColonyAddress);
    await metacolony.setNetworkFeeInverse(UINT256_MAX);

    const extension = await Salaries.new();
    version = await extension.version();
  });

  beforeEach(async () => {
    ({ colony, token } = await setupRandomColony(colonyNetwork));

    await colony.installExtension(SALARIES, version);

    const salariesAddress = await colonyNetwork.getExtensionInstallation(SALARIES, colony.address);
    salaries = await Salaries.at(salariesAddress);

    await colony.setFundingRole(1, UINT256_MAX, salaries.address, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, salaries.address, 1, true);

    await colony.setFundingRole(1, UINT256_MAX, USER0, 1, true);
    await colony.setAdministrationRole(1, UINT256_MAX, USER0, 1, true);
  });

  describe("managing the extension", async () => {
    it("can install the extension manually", async () => {
      salaries = await Salaries.new();
      await salaries.install(colony.address);

      await checkErrorRevert(salaries.install(colony.address), "extension-already-installed");

      const identifier = await salaries.identifier();
      expect(identifier).to.equal(SALARIES);

      const capabilityRoles = await salaries.getCapabilityRoles("0x0");
      expect(capabilityRoles).to.equal(ethers.constants.HashZero);

      await salaries.finishUpgrade();
      await salaries.deprecate(true);
      await salaries.uninstall();

      const code = await web3GetCode(salaries.address);
      expect(code).to.equal("0x");
    });

    it("can install the extension with the extension manager", async () => {
      ({ colony } = await setupRandomColony(colonyNetwork));
      await colony.installExtension(SALARIES, version, { from: USER0 });

      await checkErrorRevert(colony.installExtension(SALARIES, version, { from: USER0 }), "colony-network-extension-already-installed");
      await checkErrorRevert(colony.uninstallExtension(SALARIES, { from: USER1 }), "ds-auth-unauthorized");

      await colony.uninstallExtension(SALARIES, { from: USER0 });
    });
  });

  describe("using the extension", async () => {
    it("can create a salary", async () => {
      let salaryCount;

      salaryCount = await salaries.getNumSalaries();
      expect(salaryCount).to.be.zero;

      await salaries.createSalary(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);

      salaryCount = await salaries.getNumSalaries();
      expect(salaryCount).to.eq.BN(1);
    });

    it("can claim a salary", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await salaries.createSalary(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const salaryId = await salaries.getNumSalaries();

      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, salaryId];
      await makeTxAtTimestamp(salaries.claimSalary, claimArgs, blockTime + (SECONDS_PER_DAY * 2), this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee
    });

    it("can cancel a salary", async () => {
      await salaries.createSalary(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const salaryId = await salaries.getNumSalaries();

      await salaries.cancelSalary(salaryId);

      const salary = salaries.getSalary(salaryId);
      expect(salary.claimFrom).to.eq.BN(salary.claimUntil);
    });

    it("can claim a salary multiple times", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await salaries.createSalary(1, UINT256_MAX, 1, 0, 0, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const salaryId = await salaries.getNumSalaries();

      let balancePre;
      let balancePost;
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, salaryId];

      // Claim 2 WADs
      balancePre = await token.balanceOf(USER1);
      await makeTxAtTimestamp(salaries.claimSalary, claimArgs, blockTime + (SECONDS_PER_DAY * 2), this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.muln(2).subn(1)); // -1 for network fee

      // Claim 1 WAD
      balancePre = await token.balanceOf(USER1);
      await makeTxAtTimestamp(salaries.claimSalary, claimArgs, blockTime + (SECONDS_PER_DAY * 3), this);
      balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.eq.BN(WAD.subn(1)); // -1 for network fee
    });

    it("can claim nothing", async () => {
      await fundColonyWithTokens(colony, token, WAD.muln(10));

      const tx = await salaries.createSalary(1, UINT256_MAX, 1, 100, 100, SECONDS_PER_DAY, USER1, [token.address], [WAD]);
      const blockTime = await getBlockTime(tx.receipt.blockNumber);
      const salaryId = await salaries.getNumSalaries();

      // Now claim at the same timestamp
      const balancePre = await token.balanceOf(USER1);
      const claimArgs = [1, UINT256_MAX, UINT256_MAX, UINT256_MAX, salaryId];
      await makeTxAtTimestamp(salaries.claimSalary, claimArgs, blockTime, this);
      const balancePost = await token.balanceOf(USER1);
      expect(balancePost.sub(balancePre)).to.be.zero;
    });
  });
});
