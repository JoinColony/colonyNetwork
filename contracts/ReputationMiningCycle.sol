pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./ERC20Extended.sol";
import "./ColonyNetworkStorage.sol";
import "./IColonyNetwork.sol";
import "./PatriciaTree/PatriciaTree.sol";

// TODO: Can we handle a dispute regarding the very first hash that should be set?

contract ReputationMiningCycle is PatriciaTree, DSMath {
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
    bytes32 jrh;
    bytes32 intermediateReputationHash;
    uint256 jrhNnodes;
    uint256 lowerBound;
    uint256 upperBound;
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

  constructor() public {
    colonyNetworkAddress = msg.sender;
    reputationMiningWindowOpenTimestamp = now;
  }

  function binarySearchForChallenge(uint256 round, uint256 idx, bytes32 intermediateReputationHash, uint branchMask, bytes32[] siblings) public {
    // TODO: Check this challenge is active.
    // This require is necessary, but not a sufficient check (need to check we have an opponent, at least).
    require(disputeRounds[round][idx].lowerBound!=disputeRounds[round][idx].upperBound);

    uint256 targetNode = add(disputeRounds[round][idx].lowerBound, sub(disputeRounds[round][idx].upperBound, disputeRounds[round][idx].lowerBound)/2);
    bytes32 jrh = disputeRounds[round][idx].jrh;

    verifyProof(jrh, bytes32(targetNode), intermediateReputationHash, branchMask, siblings);
    // If verifyProof hasn't thrown, proof is correct.
    // Process the consequences
    processBinaryChallengeSearchResponse(round, idx, intermediateReputationHash, targetNode);
  }
  event LogUint(string a, uint b);
  function processBinaryChallengeSearchResponse(uint256 round, uint256 idx, bytes32 intermediateReputationHash, uint256 targetNode) internal {
    disputeRounds[round][idx].lastResponseTimestamp = now;
    disputeRounds[round][idx].challengeStepCompleted += 1;
    // If opponent hasn't responded yet, nothing more to do except save our intermediate hash
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    if (disputeRounds[round][opponentIdx].challengeStepCompleted != disputeRounds[round][idx].challengeStepCompleted ) {
      disputeRounds[round][idx].intermediateReputationHash = intermediateReputationHash;
    } else {
      // Our opponent answered this challenge already.
      // Compare our intermediateReputationHash to theirs to establish how to move the bounds.
      processBinaryChallengeSearchStep(round, idx, intermediateReputationHash, targetNode);
    }
  }

  function processBinaryChallengeSearchStep(uint256 round, uint256 idx, bytes32 intermediateReputationHash, uint256 targetNode) internal {
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    Bytes32(intermediateReputationHash);
    Bytes32(disputeRounds[round][opponentIdx].intermediateReputationHash);
    if (disputeRounds[round][opponentIdx].intermediateReputationHash == intermediateReputationHash) {
      disputeRounds[round][idx].lowerBound = targetNode + 1;
      disputeRounds[round][opponentIdx].lowerBound = targetNode + 1;
    } else {
      // NB no '-1' to mirror the '+1' above in the other bound, because
      // we're looking for the first index where these two submissions differ
      // in their calculations - they disagreed for this index, so this might
      // be the first index they disagree about
      disputeRounds[round][idx].upperBound = targetNode;
      disputeRounds[round][opponentIdx].upperBound = targetNode;
    }
    // Remove the intermediate hashes.
    // We don't need to keep these, as they will have to prove these are in the JRH, which
    // we have on chain, in 'respondToChallenge'.
    // TODO: It's not clear whether keeping these would be more efficient.
    disputeRounds[round][idx].intermediateReputationHash = 0x0;
    disputeRounds[round][opponentIdx].intermediateReputationHash = 0x0;

    // Our opponent responded to this step of the challenge before we did, so we should
    // reset their 'last response' time to now, as they aren't able to respond
    // to the next challenge before they know what it is!
    disputeRounds[round][opponentIdx].lastResponseTimestamp = now;
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

  function respondToChallengeReal(uint256 round, uint256 idx, bytes _reputationKey, uint reputationBranchMask, bytes32[] reputationSiblings, bytes agreeStateReputationValue, uint agreeStateBranchMask, bytes32[] agreeStateSiblings, bytes disagreeStateReputationValue, uint disagreeStateBranchMask, bytes32[] disagreeStateSiblings) public {
    // TODO: More checks that this is an appropriate time to respondToChallenge
    require(disputeRounds[round][idx].lowerBound==disputeRounds[round][idx].upperBound);
    bytes32 jrh = disputeRounds[round][idx].jrh;
    // The contract knows
    // 1. the jrh for this submission
    // 2. The first index where this submission and its opponent differ.
    // Need to prove
    // 1. The reputation that is updated that we disagree on's value, before the first index
    //    where we differ, and in the first index where we differ.
    // 2. That no other changes are made to the reputation state. The proof for those
    //    two reputations in (1) is therefore required to be the same.
    // 3. That our 'after' value is correct. This is done by doing the calculation on-chain, perhaps
    //    after looking up the corresponding entry in the reputation update log (the alternative is
    //    that it's a decay calculation - not yet implemented.)

    // Check the supplied key is appropriate.
    checkKey(_reputationKey, disputeRounds[round][idx].lowerBound);

    // Prove the reputation's starting value is in some state, and that state is in the appropriate index in our JRH
    proveBeforeReputationValue(round, idx, jrh, _reputationKey, agreeStateReputationValue, reputationBranchMask, reputationSiblings, agreeStateBranchMask, agreeStateSiblings);

    // Prove the reputation's final value is in a particular state, and that state is in our JRH in the appropriate index (corresponding to the first disagreement between these miners)
    // By using the same branchMask and siblings, we know that no other changes to the reputation state tree have been slipped in.
    proveAfterReputationValue(disputeRounds[round][idx].lowerBound, jrh, _reputationKey, disagreeStateReputationValue, reputationBranchMask, reputationSiblings, disagreeStateBranchMask, disagreeStateSiblings);

    // Perform the reputation calculation ourselves.
    performReputationCalculation(disputeRounds[round][idx].lowerBound, agreeStateReputationValue, disagreeStateReputationValue);

    // If everthing checked out, note that we've responded to the challenge.
    disputeRounds[round][idx].challengeStepCompleted += 1;
    disputeRounds[round][idx].lastResponseTimestamp = now;

    // Safety net?
    /* if (disputeRounds[round][idx].challengeStepCompleted==disputeRounds[round][opponentIdx].challengeStepCompleted){
      // Freeze the reputation mining system.
    } */

  }

  event Address(address a);
  event Uint256(uint256 b);
  function checkKey( bytes _reputationKey, uint256 firstDisagreeIdx) internal {
    // If the state transition we're checking is less than the number of nodes in the currently accepted state, it's a decay transition (TODO: not implemented)
    // Otherwise, look up the corresponding entry in the reputation log.
    uint256 updateNumber = firstDisagreeIdx - 1;
    bytes memory reputationKey = new bytes(20+32+20);
    reputationKey = _reputationKey;
    address colonyAddress;
    address userAddress;
    uint256 skillId;
    assembly {
        colonyAddress := mload(add(reputationKey,20)) // 20, not 32, because we're copying in to a slot that will be interpreted as an address.
                                              // which will truncate the leftmost 12 bytes
        skillId := mload(add(reputationKey, 52))
        userAddress := mload(add(reputationKey,72))   // 72, not 84, for the same reason as above. Is this being too clever? I don't think there are
                                              // any unintended side effects here, but I'm not quite confortable enough with EVM's stack to be sure.
                                              // Not sure what the alternative would be anyway.
    }
    bool decayCalculation = false;
    if (decayCalculation) {
    } else {
      address logUserAddress;
      uint256 logSkillId;
      address logColonyAddress;

      (logUserAddress, , logSkillId, logColonyAddress, , ) = IColonyNetwork(colonyNetworkAddress).getReputationUpdateLogEntry(updateNumber, false);
      require(logUserAddress == userAddress);
      require(logColonyAddress == colonyAddress);
      require(logSkillId == skillId);
    }
  }

  event Bytes(bytes a);
  event Bytes32(bytes32 a);
  function proveBeforeReputationValue(uint256 round, uint256 idx, bytes32 jrh, bytes _reputationKey, bytes agreeStateReputationValue, uint256 reputationBranchMask, bytes32[] reputationSiblings, uint256 agreeStateBranchMask, bytes32[] agreeStateSiblings) internal {
    uint256 lastAgreeIdx = disputeRounds[round][idx].lowerBound - 1; // We binary searched to the first disagreement, so the last agreement is the one before.
    uint256 reputationValue;
    assembly {
        reputationValue := mload(add(agreeStateReputationValue, 32))
    }

    bytes32 reputationRootHash = getImpliedRoot(_reputationKey, agreeStateReputationValue, reputationBranchMask, reputationSiblings);
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions
    // agree on.
    bytes32 impliedRoot = getImpliedRootBytes32(bytes32(lastAgreeIdx), reputationRootHash, agreeStateBranchMask, agreeStateSiblings);

    if (reputationValue == 0 && impliedRoot != jrh) {
      // This implies they are claiming that this is a new hash.
      return;
    }
    require(impliedRoot == jrh);
    // They've actually verified whatever they claimed. We increment their challengeStepCompleted by one to indicate this.
    // In the event that our opponent lied about this reputation not existing yet in the tree, they will both complete
    // a call to respondToChallenge, but we will have a higher challengeStepCompleted value, and so they will be the ones
    // eliminated.
    disputeRounds[round][idx].challengeStepCompleted += 1;
    // I think this trick can be used exactly once, and only because this is the last function to be called in the challege,
    // and I'm choosing to use it here. I *think* this is okay, because the only situation
    // where we don't prove anything with merkle proofs in this whole dance is here.
  }

  function proveAfterReputationValue(uint256 lowerBound, bytes32 jrh, bytes _reputationKey, bytes disagreeStateReputationValue, uint256 reputationBranchMask, bytes32[] reputationSiblings, uint256 disagreeStateBranchMask, bytes32[] disagreeStateSiblings) internal {
    bytes32 reputationRootHash = getImpliedRoot(_reputationKey, disagreeStateReputationValue, reputationBranchMask, reputationSiblings);
    // Prove that state is in our JRH, in the index corresponding to the last state that the two submissions
    // agree on.
    uint256 firstDisagreeIdx = lowerBound;
    verifyProof(jrh, bytes32(firstDisagreeIdx), reputationRootHash, disagreeStateBranchMask, disagreeStateSiblings);
  }

  event Int(int a);

  function performReputationCalculation(uint256 firstDisagreeIdx, bytes agreeStateReputationValueBytes, bytes disagreeStateReputationValueBytes) internal {
    // TODO: Possibility of decay calculation
    uint reputationTransitionIdx = firstDisagreeIdx - 1;
    int256 amount;
    uint256 agreeStateReputationValue;
    uint256 disagreeStateReputationValue;

    assembly {
        agreeStateReputationValue := mload(add(agreeStateReputationValueBytes, 32))
        disagreeStateReputationValue := mload(add(disagreeStateReputationValueBytes, 32))
    }
    // TODO: Check the unique ID.

    (, amount, , , ,) = IColonyNetwork(colonyNetworkAddress).getReputationUpdateLogEntry(reputationTransitionIdx, false);
    // TODO: Is this safe? I think so, because even if there's over/underflows, they should
    // still be the same number.
    require(int(agreeStateReputationValue)+amount == int(disagreeStateReputationValue));
  }


  function submitJRH(
    uint256 index,
    bytes32 jrh,
    uint branchMask1,
    bytes32[] siblings1,
    uint branchMask2,
    bytes32[] siblings2
  ) public
  {
    // Require we've not submitted already.
    require(disputeRounds[0][index].jrh == 0x0);

    // Check the proofs for the JRH
    require(checkJRHProof1(jrh, branchMask1, siblings1));
    require(checkJRHProof2(index, jrh, branchMask2, siblings2));

    // Store their JRH
    disputeRounds[0][index].jrh = jrh;
    disputeRounds[0][index].lastResponseTimestamp = now;
    disputeRounds[0][index].challengeStepCompleted += 1;

    // Set bounds for first binary search if it's going to be needed
    disputeRounds[0][index].upperBound = disputeRounds[0][index].jrhNnodes;
  }

  function checkJRHProof1(bytes32 jrh, uint branchMask1, bytes32[] siblings1) internal returns (bool result) {
    // Proof 1 needs to prove that they started with the current reputation root hash
    bytes32 reputationRootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    return verifyProof(jrh, bytes32(0), reputationRootHash, branchMask1, siblings1);
  }

  function checkJRHProof2(uint index, bytes32 jrh, uint branchMask2, bytes32[] siblings2) internal returns (bool result) {
    // Proof 2 needs to prove that they finished with the reputation root hash they submitted, and the
    // key is the number of updates in the reputation update log (implemented)
    // plus the number of nodes in the last accepted update, each of which will have decayed once (not implemented)
    // TODO: Account for decay calculations
    uint256 nUpdates = IColonyNetwork(colonyNetworkAddress).getReputationUpdateLogLength(false);
    disputeRounds[0][index].jrhNnodes = nUpdates + 1;
    bytes32 submittedHash = disputeRounds[0][index].hash;
    return verifyProof(jrh, bytes32(nUpdates), submittedHash, branchMask2, siblings2);
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
      disputeRounds[0].push(Submission({
        hash: newHash,
        jrh: 0x0,
        nNodes: nNodes,
        lastResponseTimestamp: 0,
        challengeStepCompleted: 0,
        lowerBound: 0,
        upperBound: 0,
        jrhNnodes: 0,
        intermediateReputationHash: 0x0
      }));
      // If we've got a pair of submissions to face off, may as well start now.
      if (nSubmittedHashes % 2 == 0) {
        disputeRounds[0][nSubmittedHashes-1].lastResponseTimestamp = now;
        disputeRounds[0][nSubmittedHashes-2].lastResponseTimestamp = now;
        /* disputeRounds[0][nSubmittedHashes-1].upperBound = disputeRounds[0][nSubmittedHashes-1].jrhNnodes; */
        /* disputeRounds[0][nSubmittedHashes-2].upperBound = disputeRounds[0][nSubmittedHashes-2].jrhNnodes; */
      }
    }


    reputationHashSubmissions[msg.sender] = Submission({
      hash: newHash,
      jrh: 0x0,
      nNodes: nNodes,
      lastResponseTimestamp: 0,
      challengeStepCompleted: 0,
      lowerBound: 0,
      upperBound: 0,
      jrhNnodes: 0,
      intermediateReputationHash: 0x0
    });
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

  function startMemberOfPair(uint256 roundNumber, uint256 index) internal {
    disputeRounds[roundNumber][index].lastResponseTimestamp = now;
    disputeRounds[roundNumber][index].upperBound = disputeRounds[roundNumber][index].jrhNnodes;
    disputeRounds[roundNumber][index].lowerBound = 0;
    if (disputeRounds[roundNumber][index].jrh != 0x0) {
      // If this submission has a JRH, we give ourselves credit for it in the next round - it's possible
      // that a submission got a bye without submitting a JRH, which will not have this starting '1'.
      disputeRounds[roundNumber][index].challengeStepCompleted = 1;
    } else {
      disputeRounds[roundNumber][index].challengeStepCompleted = 0;
    }
  }

  function startPairingInRound(uint256 roundNumber) internal {
    uint256 nInRound = disputeRounds[roundNumber].length;
    startMemberOfPair(roundNumber, nInRound-1);
    startMemberOfPair(roundNumber, nInRound-2);
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
      delete disputeRounds[round][opponentIdx];

      // Note the fact that this round has had another challenge complete
      nHashesCompletedChallengeRound[round] += 1;
      // Check if the hash we just moved to the next round is the second of a pairing that should now face off.
      nInNextRound = disputeRounds[round+1].length;

      if (nInNextRound % 2 == 0) {
        startPairingInRound(round+1);
      }
    } else {
      require(disputeRounds[round].length > opponentIdx);
      require(disputeRounds[round][opponentIdx].hash!="");
      // Require that this is not better than its opponent.
      require(disputeRounds[round][opponentIdx].challengeStepCompleted >= disputeRounds[round][idx].challengeStepCompleted);
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
          startPairingInRound(round+1);
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
