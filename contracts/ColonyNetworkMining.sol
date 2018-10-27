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

import "./ColonyNetworkStorage.sol";
import "./ERC20Extended.sol";
import "./IReputationMiningCycle.sol";
import "./ITokenLocking.sol";
import "./EtherRouter.sol";


contract ColonyNetworkMining is ColonyNetworkStorage {
  // TODO: Can we handle a dispute regarding the very first hash that should be set?

  modifier onlyReputationMiningCycle () {
    require(msg.sender == activeReputationMiningCycle, "colony-reputation-mining-sender-not-active-reputation-cycle");
    _;
  }

  function setReplacementReputationUpdateLogEntry(
    address _reputationMiningCycle,
    uint256 _id,
    address _user,
    int _amount,
    uint256 _skillId,
    address _colony,
    uint256 _nUpdates,
    uint256 _nPreviousUpdates)
    public recovery auth
    {
    replacementReputationUpdateLogsExist[_reputationMiningCycle] = true;

    replacementReputationUpdateLog[_reputationMiningCycle][_id] = ReputationLogEntry(
      _user,
      _amount,
      _skillId,
      _colony,
      _nUpdates,
      _nPreviousUpdates
    );
  }

  function getReplacementReputationUpdateLogEntry(address _reputationMiningCycle, uint256 _id) public view returns
    (address, int256, uint256, address, uint256, uint256)
    {
    ReputationLogEntry storage x = replacementReputationUpdateLog[_reputationMiningCycle][_id];
    return (x.user, x.amount, x.skillId, x.colony, x.nUpdates, x.nPreviousUpdates);
  }

  function getReplacementReputationUpdateLogsExist(address _reputationMiningCycle) public view returns (bool) {
    return replacementReputationUpdateLogsExist[_reputationMiningCycle];
  }

  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] stakers, uint256 reward) public
  stoppable
  onlyReputationMiningCycle
  {
    reputationRootHash = newHash;
    reputationRootHashNNodes = newNNodes;
    // Reward stakers
    activeReputationMiningCycle = 0x0;
    startNextCycle();
    rewardStakers(stakers, reward);
  }

  function initialiseReputationMining() public stoppable {
    require(inactiveReputationMiningCycle == 0x0, "colony-reputation-mining-already-initialised");
    address clnyToken = IColony(metaColony).getToken();
    require(clnyToken != 0x0, "colony-reputation-mining-clny-token-invalid-address");

    inactiveReputationMiningCycle = new EtherRouter();
    EtherRouter(inactiveReputationMiningCycle).setResolver(miningCycleResolver);
    IReputationMiningCycle(inactiveReputationMiningCycle).initialise(tokenLocking, clnyToken);
  }

  event ReputationMiningCycleComplete(bytes32 hash, uint256 nNodes);

  function startNextCycle() public stoppable {
    address clnyToken = IColony(metaColony).getToken();
    require(clnyToken != 0x0, "colony-reputation-mining-clny-token-invalid-address");
    require(activeReputationMiningCycle == 0x0, "colony-reputation-mining-still-active");
    require(inactiveReputationMiningCycle != 0x0, "colony-reputation-mining-not-initialised");
    // Inactive now becomes active
    activeReputationMiningCycle = inactiveReputationMiningCycle;
    IReputationMiningCycle(activeReputationMiningCycle).resetWindow();

    inactiveReputationMiningCycle = new EtherRouter();
    EtherRouter(inactiveReputationMiningCycle).setResolver(miningCycleResolver);
    IReputationMiningCycle(inactiveReputationMiningCycle).initialise(tokenLocking, clnyToken);
    emit ReputationMiningCycleComplete(reputationRootHash, reputationRootHashNNodes);
  }

  function getReputationMiningCycle(bool _active) public view returns(address) {
    if (_active) {
      return activeReputationMiningCycle;
    } else {
      return inactiveReputationMiningCycle;
    }
  }

  // Constants for miner weight calculations
  uint256 constant T = 7776000 * WAD; // Seconds in 90 days
  uint256 constant N = 24 * WAD; // 2x maximum number of miners
  uint256 constant UINT32_MAX = 4294967295;

  function calculateMinerWeight(uint256 timeStaked, uint256 submissonIndex) public view returns (uint256) {
    require((submissonIndex >= 1) && (submissonIndex <= 12), "colony-reputation-mining-invalid-submission-index");
    uint256 timeStakedMax = min(timeStaked, UINT32_MAX); // Maximum of ~136 years (uint32)

    // (1 - exp{-t_n/T}) * (1 - (n-1)/N), 3rd degree Taylor expansion for exponential term
    uint256 tnDivT = wdiv(timeStakedMax * WAD, T);
    uint256 expTnDivT = add(add(add(WAD, tnDivT), wmul(tnDivT, tnDivT) / 2), wmul(wmul(tnDivT, tnDivT), tnDivT) / 6);
    uint256 stakeTerm = sub(WAD, wdiv(WAD, expTnDivT));
    uint256 submissionTerm = sub(WAD, wdiv((submissonIndex - 1) * WAD, N));
    return wmul(stakeTerm, submissionTerm);
  }

  function rewardStakers(address[] stakers, uint256 reward) internal {
    // Internal unlike punish, because it's only ever called from setReputationRootHash

    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.confirmNewHash;

    uint256 i;
    address clnyToken = IColony(metaColony).getToken();

    // I. Calculate (normalized) miner weights
    uint256 timeStaked;
    uint256 minerWeightsTotal;
    uint256[] memory minerWeights = new uint256[](stakers.length);

    for (i = 0; i < stakers.length; i++) {
      (,,timeStaked) = ITokenLocking(tokenLocking).getUserLock(clnyToken, stakers[i]);
      minerWeights[i] = calculateMinerWeight(now - timeStaked, i + 1);
      minerWeightsTotal = add(minerWeightsTotal, minerWeights[i]);
    }

    for (i = 0; i < stakers.length; i++) {
      minerWeights[i] = wdiv(minerWeights[i], minerWeightsTotal);
    }

    // II. Disburse reputation and tokens
    IMetaColony(metaColony).mintTokensForColonyNetwork(reward);

    // This gives them reputation in the next update cycle.
    IReputationMiningCycle(inactiveReputationMiningCycle).rewardStakersWithReputation(
      stakers,
      minerWeights,
      metaColony,
      reward,
      rootGlobalSkillId + 2
    );

    for (i = 0; i < stakers.length; i++) {
      ERC20Extended(clnyToken).transfer(stakers[i], wmul(reward, minerWeights[i]));
    }
  }
}
