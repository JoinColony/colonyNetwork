/* globals artifacts */

import chai from "chai";
import bnChai from "bn-chai";
import shortid from "shortid";
import { soliditySha3 } from "web3-utils";

import { WAD, SECONDS_PER_DAY } from "../../helpers/constants";
import { setupColonyNetwork, setupColony } from "../../helpers/test-data-generator";
import { forwardTime, getTokenArgs } from "../../helpers/test-helper";

const { expect } = chai;
chai.use(bnChai(web3.utils.BN));

const Token = artifacts.require("Token");
const TokenAuthority = artifacts.require("TokenAuthority");
const TokenLocking = artifacts.require("TokenLocking");
const VotingToken = artifacts.require("VotingToken");

contract("Voting Token", accounts => {
  let colony;
  let token;
  let colonyNetwork;
  let tokenLocking;
  let votingToken;

  const USER0 = accounts[0];
  const USER1 = accounts[1];

  const SALT = soliditySha3(shortid.generate());
  const WAD2 = WAD.muln(2);

  before(async () => {
    colonyNetwork = await setupColonyNetwork();

    const tokenLockingAddress = await colonyNetwork.getTokenLocking();
    tokenLocking = await TokenLocking.at(tokenLockingAddress);
  });

  beforeEach(async () => {
    token = await Token.new(...getTokenArgs());
    colony = await setupColony(colonyNetwork, token.address);

    const tokenAuthority = await TokenAuthority.new(token.address, colony.address, [tokenLocking.address]);
    await token.setAuthority(tokenAuthority.address);

    await token.mint(USER0, WAD2);
    await token.approve(tokenLocking.address, WAD2, { from: USER0 });
    await tokenLocking.deposit(token.address, WAD2, { from: USER0 });

    await token.mint(USER1, WAD);
    await token.approve(tokenLocking.address, WAD, { from: USER1 });
    await tokenLocking.deposit(token.address, WAD, { from: USER1 });

    votingToken = await VotingToken.new(colony.address);
  });

  describe.only("token voting", async () => {
    it("can create a new poll", async () => {
      let pollCount = await votingToken.getPollCount();
      expect(pollCount).to.be.zero;

      await votingToken.createPoll(2, SECONDS_PER_DAY);
      pollCount = await votingToken.getPollCount();
      expect(pollCount).to.eq.BN(1);
    });

    it("can rate and reveal for a poll", async () => {
      await votingToken.createPoll(2, SECONDS_PER_DAY);
      const pollId = await votingToken.getPollCount();
      await votingToken.submitVote(pollId, soliditySha3(SALT, 0), 0, { from: USER0 });

      await forwardTime(SECONDS_PER_DAY, this);
      await votingToken.revealVote(pollId, SALT, 0, { from: USER0 });
    });

    it("can tally votes for a poll", async () => {
      await votingToken.createPoll(3, SECONDS_PER_DAY);
      const pollId = await votingToken.getPollCount();

      await votingToken.submitVote(pollId, soliditySha3(SALT, 0), 0, { from: USER0 });
      await votingToken.submitVote(pollId, soliditySha3(SALT, 1), 0, { from: USER1 });

      await forwardTime(SECONDS_PER_DAY, this);

      await votingToken.revealVote(pollId, SALT, 0, { from: USER0 });
      await votingToken.revealVote(pollId, SALT, 1, { from: USER1 });

      const { voteCounts } = await votingToken.getPollInfo(pollId);
      expect(voteCounts[0]).to.eq.BN(WAD2);
      expect(voteCounts[1]).to.eq.BN(WAD);
      expect(voteCounts[2]).to.be.zero;
    });
  });
});
