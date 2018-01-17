pragma solidity ^0.4.17;
pragma experimental "v0.5.0";
pragma experimental "ABIEncoderV2";

import "../lib/dappsys/auth.sol";
import "./Authority.sol";
import "./IColony.sol";
import "./EtherRouter.sol";
import "./Token.sol";
import "./ColonyNetworkStorage.sol";
import "./IColonyNetwork.sol";


contract ColonyNetworkStaking is ColonyNetworkStorage {

  event Address(address _a);
  event Bool(bool _b);
  function deposit(uint _amount) public {
    // Get CLNY address
    Token clny = Token(IColony(_colonies["Common Colony"]).getToken());
    uint256 networkBalance = clny.balanceOf(this);
    // Move some over.
    clny.transferFrom(msg.sender, this, _amount);
    // Check it actually transferred
    assert(clny.balanceOf(this)-networkBalance==_amount);
    // Note who it belongs to.
    stakedBalances[msg.sender] += _amount;
  }

  function withdraw(uint _amount) public {
    uint256 balance = stakedBalances[msg.sender];
    require(balance >= _amount);
    bool hasRequesterSubmitted = ReputationMiningCycle(reputationMiningCycle).hasSubmitted(msg.sender);
    Bool(hasRequesterSubmitted);
    require(hasRequesterSubmitted==false);
    stakedBalances[msg.sender] -= _amount;
    Token clny = Token(IColony(_colonies["Common Colony"]).getToken());
    clny.transfer(msg.sender, _amount);
  }

  function getStakedBalance(address _user) public view returns (uint) {
    return stakedBalances[_user];
  }

  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] stakers) public {
    require(msg.sender == reputationMiningCycle);
    reputationRootHash = newHash;
    reputationRootHashNNodes = newNNodes;
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

  function punishStakers(address[] stakers) public {
    // TODO: Actually think about this function
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    require(msg.sender == reputationMiningCycle);
    for (uint256 i = 0; i < stakers.length; i++) {
      // This is pretty harsh! Are we happy with this?
      // Alternative: lose more than they would have gained for backing the right hash.
      stakedBalances[stakers[i]] = 0;
    }
    // TODO: Where do these staked tokens go?
  }

  function rewardStakers(address[] stakers) internal {
    // Internal unlike punish, because it's only ever called from setReputationRootHash

    // TODO: Actually think about this function
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    // for (uint256 i = 0; i < stakers.length; i++) {
    //   //We need to... do something. They get newly minted tokens, right?
    // }
  }
}


contract ReputationMiningCycle {
  address colonyNetworkAddress;
  mapping (bytes32 => mapping( uint256 => address[])) public submittedHashes;
  uint reputationMiningWindowOpenTimestamp;
  mapping (uint256 => Submission[]) disputeRounds;
  uint256 public nSubmittedHashes = 0;
  uint256 public nInvalidatedHashes = 0;
  mapping (address => bool) public hasSubmitted;

  struct Submission {
    bytes32 hash;
    uint256 nNodes;
  }

  // Prevent addresses from submitting more than one hash?


  // Records for which hashes, for which addresses, for which entries have been accepted
  // Otherwise, people could keep submitting the same entry.
  mapping (bytes32 => mapping(address => mapping(uint => bool))) submittedEntries;

  event Hash(bytes32 hash);

  function ReputationMiningCycle() public {
    colonyNetworkAddress = msg.sender;
    reputationMiningWindowOpenTimestamp = now;
  }

  function submitNewHash(bytes32 newHash, uint256 nNodes, uint256 entry) public {
    //Check the ticket is an eligible one for them to claim
    require(entry <= IColonyNetwork(colonyNetworkAddress).getStakedBalance(msg.sender) / 10**15);
    require(entry > 0);
    // TODO: Require minimum stake, that is (much) more than the cost required to defend the valid submission.
    //Check the ticket is a winning one.
    // require((now-reputationMiningWindowOpenTimestamp) < 3600);
    // x = floor(uint((2**256 - 1) / 3600)
    if (now-reputationMiningWindowOpenTimestamp < 3600) {
      uint x = 32164469232587832062103051391302196625908329073789045566515995557753647122;
      uint target = (now - reputationMiningWindowOpenTimestamp ) * x;
      require(uint256(keccak256(msg.sender, entry, newHash)) < target);
    }

    //Insert in to list of submissions if there's still room.
    require (submittedHashes[newHash][nNodes].length <= 12);

    // Require they've not submitted this before
    // require (submittedEntries[newHash][msg.sender][entry] == false);

    // If this is a new hash, increment nSubmittedHashes as such.
    if (submittedHashes[newHash][nNodes].length == 0) {
      nSubmittedHashes += 1;
      // And add it to the first disputeRound
      disputeRounds[0].push(Submission({hash: newHash, nNodes: nNodes}));
    }


    hasSubmitted[msg.sender] = true;
    //And add the miner to the array list of submissions here
    submittedHashes[newHash][nNodes].push(msg.sender);
    //Note that they submitted it.
    submittedEntries[newHash][msg.sender][entry] = true;
  }

  function confirmNewHash(uint256 roundNumber) public {
    require (nSubmittedHashes - nInvalidatedHashes == 1);
    require (disputeRounds[roundNumber].length == 1); //i.e. this is the hash that 'survived' all the challenges
    // TODO: Require some amount of time to have passed (i.e. people have had a chance to submit other hashes)
    Submission storage reputationRootHash = disputeRounds[roundNumber][0];
    IColonyNetwork(colonyNetworkAddress).setReputationRootHash(reputationRootHash.hash, reputationRootHash.nNodes, submittedHashes[disputeRounds[roundNumber][0].hash][disputeRounds[roundNumber][0].nNodes]);
    selfdestruct(colonyNetworkAddress);
  }

  function invalidateHash(uint256 round, uint256 idx) public {
    // TODO: Require that it has failed a challenge, or failed to respond in time.
    // Move its opponent on to the next stage.
    uint256 opponentIdx = (idx % 2 == 1 ? idx-1 : idx + 1);
    // TODO: Check opponent is good to move on - we're assuming both haven't timed out here.

    // We require that we actually had an opponent - can't invalidate the last hash.
    // If we try, then the next require should catch it.
    require(disputeRounds[round].length > opponentIdx);
    require(disputeRounds[round][opponentIdx].hash!="");
    disputeRounds[round+1].push(disputeRounds[round][opponentIdx]);
    delete disputeRounds[round][opponentIdx];
    nInvalidatedHashes += 1;

    // Punish the people who proposed this
    IColonyNetwork(colonyNetworkAddress).punishStakers(submittedHashes[disputeRounds[round][idx].hash][disputeRounds[round][idx].nNodes]);

    //TODO: Can we do some deleting to make calling this as cheap as possible for people?
  }



}