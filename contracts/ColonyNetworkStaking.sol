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
import "./ReputationMiningCycle.sol";


contract ColonyNetworkStaking is ColonyNetworkStorage, DSMath {
  // TODO: Can we handle a dispute regarding the very first hash that should be set?

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
