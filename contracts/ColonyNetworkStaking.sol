/*
  This file is part of The Colony Network.

  The Colony Network is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  The Colony Network is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with The Colony Network. If not, see <http://www.gnu.org/licenses/>.
*/

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

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
    require(msg.sender == activeReputationMiningCycle);
    _;
  }

  function deposit(uint256 _amount) public {
    // Get CLNY address
    ERC20Extended clny = ERC20Extended(IColony(metaColony).getToken());
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
    (submittedHash, , , , , , , , , , ) = ReputationMiningCycle(activeReputationMiningCycle).reputationHashSubmissions(msg.sender);
    bool hasRequesterSubmitted = submittedHash == 0x0 ? false : true;
    require(hasRequesterSubmitted==false);
    stakedBalances[msg.sender] -= _amount;
    ERC20Extended clny = ERC20Extended(IColony(metaColony).getToken());
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
    // Reward stakers
    activeReputationMiningCycle = 0x0;
    startNextCycle();
    rewardStakers(stakers);
  }

  function startNextCycle() public {
    require(activeReputationMiningCycle == 0x0);
    activeReputationMiningCycle = inactiveReputationMiningCycle;
    if (activeReputationMiningCycle == 0x0) {
      // This will only be true the very first time that this is run, to kick off the whole reputation mining process
      activeReputationMiningCycle = new ReputationMiningCycle();
    }
    ReputationMiningCycle(activeReputationMiningCycle).resetWindow();
    inactiveReputationMiningCycle = new ReputationMiningCycle();
  }

  function getReputationMiningCycle(bool _active) public view returns(address) {
    if (_active) {
      return activeReputationMiningCycle;
    } else {
      return inactiveReputationMiningCycle;
    }
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
    uint256 reward = 10**18; //TODO: Actually work out how much reputation they earn, based on activity elsewhere in the colony.
    if (reward >= uint256(int256(-1))/2) {
      reward = uint256(int256(-1))/2;
    }
    // TODO: We need to be able to prove that the assert on the next line will never happen, otherwise we're locked out of reputation mining.
    // Something like the above cap is an adequate short-term solution, but at the very least need to double check the limits
    // (which I've fingered-in-the-air, but could easily have an OBOE hiding inside).
    assert(reward < uint256(int256(-1))); // We do a cast later, so make sure we don't overflow.

    IColony(metaColony).mintTokensForColonyNetwork(stakers.length * reward); // This should be the total amount of new tokens we're awarding.

    ReputationMiningCycle(inactiveReputationMiningCycle).rewardStakersWithReputation(stakers, metaColony, reward, rootGlobalSkillId + 2); // This gives them reputation in the next update cycle.

    for (uint256 i = 0; i < stakers.length; i++) {
      // Also give them some newly minted tokens.
      // We reinvest here as it's much easier (gas-wise).
      stakedBalances[stakers[i]] += reward;
    }
  }
}
