pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./ERC20Extended.sol";
import "./ColonyNetworkStorage.sol";
import "./IColonyNetwork.sol";


contract ColonyNetworkStaking is ColonyNetworkStorage, DSMath {

  modifier onlyReputationMiningCycle () {
    require(msg.sender == reputationMiningCycle);
    _;
  }

  function deposit(uint256 _amount) public {
    // Get CLNY address
    ERC20Extended clny = ERC20Extended(IColony(_colonies["Common Colony"]).getToken());
    uint256 networkBalance = clny.balanceOf(this);
    // Move some over.
    clny.transferFrom(msg.sender, this, _amount);
    // Check it actually transferred
    assert(clny.balanceOf(this)-networkBalance==_amount);
    // Note who it belongs to.
    stakedBalances[msg.sender] = add(stakedBalances[msg.sender], _amount);
  }

  function withdraw(uint256 _amount) public {
    uint256 balance = stakedBalances[msg.sender];
    require(balance >= _amount);
    bytes32 submittedHash;
    (submittedHash, ) = ReputationMiningCycle(reputationMiningCycle).reputationHashSubmissions(msg.sender);
    bool hasRequesterSubmitted = submittedHash == 0x0 ? false : true;
    require(hasRequesterSubmitted==false);
    stakedBalances[msg.sender] -= _amount;
    ERC20Extended clny = ERC20Extended(IColony(_colonies["Common Colony"]).getToken());
    clny.transfer(msg.sender, _amount);
  }

  function getStakedBalance(address _user) public view returns (uint) {
    return stakedBalances[_user];
  }

  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] stakers) public
  onlyReputationMiningCycle
  {
    reputationRootHash = newHash;
    reputationRootHashNNodes = newNNodes;
    // Clear out the inactive reputation log. We're setting a new root hash, so we're done with it.
    delete ReputationUpdateLogs[(activeReputationUpdateLog + 1) % 2];
    // The active reputation update log is now switched to be the one we've just cleared out.
    // The old activeReputationUpdateLog will be used for the next reputation mining cycle
    activeReputationUpdateLog = (activeReputationUpdateLog + 1) % 2;
    // Reward stakers
    rewardStakers(stakers);
    reputationMiningCycle = 0x0;
    startNextCycle();
  }

  function startNextCycle() public {
    require(reputationMiningCycle == 0x0);
    reputationMiningCycle = new ReputationMiningCycle();
  }

  function getReputationMiningCycle() public view returns(address) {
    return reputationMiningCycle;
  }

  function punishStakers(address[] stakers) public
  onlyReputationMiningCycle
  {
    // TODO: Actually think about this function
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    for (uint256 i = 0; i < stakers.length; i++) {
      // This is pretty harsh! Are we happy with this?
      // Alternative: lose more than they would have gained for backing the right hash.
      stakedBalances[stakers[i]] = 0;
    }
    // TODO: Where do these staked tokens go? Maybe split between the person who did the 'invalidate' transaction
    // and the colony network?
    // TODO: Lose rep?
  }

  function rewardStakers(address[] stakers) internal {
    // Internal unlike punish, because it's only ever called from setReputationRootHash

    // TODO: Actually think about this function
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.confirmNewHash;
    address commonColonyAddress = _colonies["Common Colony"];
    uint256 reward = 10**18; //TODO: Actually work out how much reputation they earn, based on activity elsewhere in the colony.
    if (reward >= uint256(int256(-1))/2) {
      reward = uint256(int256(-1))/2;
    }
    // TODO: We need to be able to prove that the assert on the next line will never happen, otherwise we're locked out of reputation mining.
    // Something like the above cap is an adequate short-term solution, but at the very least need to double check the limits
    // (which I've fingered-in-the-air, but could easily have an OBOE hiding inside).
    assert(reward < uint256(int256(-1))); // We do a cast later, so make sure we don't overflow.
    IColony(commonColonyAddress).mintTokensForColonyNetwork(stakers.length * reward); // This should be the total amount of new tokens we're awarding.
    for (uint256 i = 0; i < stakers.length; i++) {
      // We *know* we're the first entries in this reputation update log, so we don't need all the bookkeeping in
      // the AppendReputationUpdateLog function
      ReputationUpdateLogs[activeReputationUpdateLog].push(ReputationLogEntry(
        stakers[i], //The staker getting the reward
        int256(reward),
        0, //TODO: Work out what skill this should be. This should be a special 'mining' skill.
        commonColonyAddress, // They earn this reputation in the common colony.
        4, // Updates the user's skill, and the colony's skill, both globally and for the special 'mining' skill
        i*4)//We're zero indexed, so this is the number of updates that came before in the reputation log.
      );

      // Also give them some newly minted tokens.
      // We reinvest here as it's much easier (gas-wise).
      stakedBalances[stakers[i]] += reward;
    }
  }
}

// TODO: Can we handle a dispute regarding the very first hash that should be set?


contract ReputationMiningCycle {
  address colonyNetworkAddress;
  // TODO: Do we need both these mappings?
  mapping (bytes32 => mapping( uint256 => address[])) public submittedHashes;
  mapping (address => Submission) public reputationHashSubmissions;
  uint256 reputationMiningWindowOpenTimestamp;
  mapping (uint256 => Submission[]) public disputeRounds;

  // Tracks the number of submissions in each round that have completed their challenge, one way or the other.
  // This might be that they passed the challenge, it might be that their opponent passed (and therefore by implication,
  // they failed), or it might be that they timed out
  mapping (uint256 => uint256) nHashesCompletedChallengeRound;
  // A flaw with this is that if someone spams lots of nonsense transactions, then 'good' users still have to come along and
  // explicitly complete the pairings. But if they get the tokens that were staked in order to make the submission, maybe
  // that's okay...?

  uint256 public nSubmittedHashes = 0;
  uint256 public nInvalidatedHashes = 0;

  struct Submission {
    bytes32 hash;
    uint256 nNodes;
    uint256 lastResponseTimestamp;
    uint256 challengeStepCompleted;
  }

  // Records for which hashes, for which addresses, for which entries have been accepted
  // Otherwise, people could keep submitting the same entry.
  mapping (bytes32 => mapping(address => mapping(uint256 => bool))) submittedEntries;

  modifier onlyFinalRoundWhenComplete(uint roundNumber){
    require (nSubmittedHashes - nInvalidatedHashes == 1);
    require (disputeRounds[roundNumber].length == 1); //i.e. this is the final round
    // Note that even if we are passed the penultimate round, which had a length of two, and had one eliminated,
    // and therefore 'delete' called in `invalidateHash`, the array still has a length of '2' - it's just that one
    // element is zeroed. If this functionality of 'delete' is ever changed, this will have to change too.
    _;
  }

  function ReputationMiningCycle() public {
    colonyNetworkAddress = msg.sender;
    reputationMiningWindowOpenTimestamp = now;
  }

  function respondToChallenge(uint256 round, uint256 idx) public {
    // TODO: Check challenge response is valid, relating to current challenge
    // TODO: Check challenge response relates to this hash

    // Assuming that the challenge response is correct...
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);

    disputeRounds[round][idx].lastResponseTimestamp = now;
    disputeRounds[round][idx].challengeStepCompleted += 1;
    // If our opponent responded to this challenge before we did, we should
    // reset their 'last response' time to now, as they aren't able to respond
    // to the next challenge before they know what it is!
    if (disputeRounds[round][idx].challengeStepCompleted == disputeRounds[round][opponentIdx].challengeStepCompleted) {
      disputeRounds[round][opponentIdx].lastResponseTimestamp = now;
    }
  }

  function submitNewHash(bytes32 newHash, uint256 nNodes, uint256 entry) public {
    //Check the ticket is an eligible one for them to claim
    require(entry <= IColonyNetwork(colonyNetworkAddress).getStakedBalance(msg.sender) / 10**15);
    require(entry > 0);
    if (reputationHashSubmissions[msg.sender].hash != 0x0) {           // If this user has submitted before during this round...
      require(newHash == reputationHashSubmissions[msg.sender].hash);  // ...require that they are submitting the same hash ...
      require(nNodes == reputationHashSubmissions[msg.sender].nNodes); // ...require that they are submitting the same number of nodes for that hash ...
      require (submittedEntries[newHash][msg.sender][entry] == false); // ... but not this exact entry
    }
    // TODO: Require minimum stake, that is (much) more than the cost required to defend the valid submission.
    // Check the ticket is a winning one.
    // TODO Figure out how to uncomment the next line, but not break tests sporadically.
    // require((now-reputationMiningWindowOpenTimestamp) <= 3600);
    // x = floor(uint((2**256 - 1) / 3600)
    if (now-reputationMiningWindowOpenTimestamp <= 3600) {
      uint256 x = 32164469232587832062103051391302196625908329073789045566515995557753647122;
      uint256 target = (now - reputationMiningWindowOpenTimestamp ) * x;
      require(uint256(keccak256(msg.sender, entry, newHash)) < target);
    }

    // We only allow this submission if there's still room
    // Check there is still room.
    require (submittedHashes[newHash][nNodes].length < 12);

    // If this is a new hash, increment nSubmittedHashes as such.
    if (submittedHashes[newHash][nNodes].length == 0) {
      nSubmittedHashes += 1;
      // And add it to the first disputeRound
      // NB if no other hash is submitted, no dispute resolution will be required.
      disputeRounds[0].push(Submission({hash: newHash, nNodes: nNodes, lastResponseTimestamp: 0, challengeStepCompleted: 0}));
      // If we've got a pair of submissions to face off, may as well start now.
      if (nSubmittedHashes % 2 == 0) {
        disputeRounds[0][nSubmittedHashes-1].lastResponseTimestamp = now;
        disputeRounds[0][nSubmittedHashes-2].lastResponseTimestamp = now;
      }
    }


    reputationHashSubmissions[msg.sender] = Submission({hash: newHash, nNodes: nNodes, lastResponseTimestamp: 0, challengeStepCompleted: 0});
    //And add the miner to the array list of submissions here
    submittedHashes[newHash][nNodes].push(msg.sender);
    //Note that they submitted it.
    submittedEntries[newHash][msg.sender][entry] = true;
  }

  function confirmNewHash(uint256 roundNumber) public
    onlyFinalRoundWhenComplete(roundNumber)
    {

    // TODO: Require some amount of time to have passed (i.e. people have had a chance to submit other hashes)
    Submission storage reputationRootHash = disputeRounds[roundNumber][0];
    IColonyNetwork(colonyNetworkAddress).setReputationRootHash(reputationRootHash.hash, reputationRootHash.nNodes, submittedHashes[disputeRounds[roundNumber][0].hash][disputeRounds[roundNumber][0].nNodes]);
    selfdestruct(colonyNetworkAddress);
  }

  function invalidateHash(uint256 round, uint256 idx) public {
    // What we do depends on our opponent, so work out which index it was at in disputeRounds[round]
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    uint256 nInNextRound;

    // We require either
    // 1. That we actually had an opponent - can't invalidate the last hash.
    // 2. This cycle had an odd number of submissions, which was larger than 1, and we're giving the last entry a bye to the next round.
    if (disputeRounds[round].length % 2 == 1 && disputeRounds[round].length == idx) {
      // This is option two above - note that because arrays are zero-indexed, if idx==length, then
      // this is the slot after the last entry, and so our opponentIdx will be the last entry
      // We just move the opponent on, and nothing else happens.

      // Ensure that the previous round is complete, and this entry wouldn't possibly get an opponent later on.
      require(nHashesCompletedChallengeRound[round-1] == disputeRounds[round-1].length);

      // Prevent us invalidating the final hash
      require(disputeRounds[round].length>1);
      // Move opponent on to next round
      disputeRounds[round+1].push(disputeRounds[round][opponentIdx]);
      // Note the fact that this round has had another challenge complete
      nHashesCompletedChallengeRound[round] += 1;
      // TODO: DRY with the code below.
      // Check if the hash we just moved to the next round is the second of a pairing that should now face off.
      nInNextRound = disputeRounds[round+1].length;

      if (nInNextRound % 2 == 0) {
        disputeRounds[round+1][nInNextRound-1].challengeStepCompleted = 0;
        disputeRounds[round+1][nInNextRound-1].lastResponseTimestamp = now;
        disputeRounds[round+1][nInNextRound-2].challengeStepCompleted = 0;
        disputeRounds[round+1][nInNextRound-2].lastResponseTimestamp = now;
      }
    } else {
      require(disputeRounds[round].length > opponentIdx);
      require(disputeRounds[round][opponentIdx].hash!="");
      // Require that it has failed a challenge (i.e. failed to respond in time)
      require(now - disputeRounds[round][idx].lastResponseTimestamp >= 600); //'In time' is ten minutes here.

      if (disputeRounds[round][opponentIdx].challengeStepCompleted > disputeRounds[round][idx].challengeStepCompleted) {
        // If true, then the opponent completed one more challenge round than the submission being invalidated, so we
        // don't know if they're valid or not yet. Move them on to the next round.
        disputeRounds[round+1].push(disputeRounds[round][opponentIdx]);
        delete disputeRounds[round][opponentIdx];
        // TODO Delete the hash(es) being invalidated?
        nInvalidatedHashes += 1;
        // Check if the hash we just moved to the next round is the second of a pairing that should now face off.
        nInNextRound = disputeRounds[round+1].length;
        if (nInNextRound % 2 == 0) {
          disputeRounds[round+1][nInNextRound-1].challengeStepCompleted = 0;
          disputeRounds[round+1][nInNextRound-1].lastResponseTimestamp = now;
          disputeRounds[round+1][nInNextRound-2].challengeStepCompleted = 0;
          disputeRounds[round+1][nInNextRound-2].lastResponseTimestamp = now;
        }
      } else {
        // Our opponent completed the same number of challenge rounds, and both have now timed out.
        nInvalidatedHashes += 2;
        // Punish the people who proposed our opponent
        IColonyNetwork(colonyNetworkAddress).punishStakers(submittedHashes[disputeRounds[round][opponentIdx].hash][disputeRounds[round][opponentIdx].nNodes]);
      }

      // Note that two hashes have completed this challenge round (either one accepted for now and one rejected, or two rejected)
      nHashesCompletedChallengeRound[round] += 2;

      // Punish the people who proposed the hash that was rejected
      IColonyNetwork(colonyNetworkAddress).punishStakers(submittedHashes[disputeRounds[round][idx].hash][disputeRounds[round][idx].nNodes]);

    }
    //TODO: Can we do some deleting to make calling this as cheap as possible for people?
  }



}
