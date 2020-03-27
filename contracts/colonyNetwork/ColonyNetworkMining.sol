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

pragma solidity 0.5.8;
pragma experimental "ABIEncoderV2";

import "./../common/ERC20Extended.sol";
import "./../common/EtherRouter.sol";
import "./../reputationMiningCycle/IReputationMiningCycle.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyNetworkStorage.sol";


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
    uint128 _nUpdates,
    uint128 _nPreviousUpdates)
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
    (ReputationLogEntry memory reputationLogEntry)
    {
    reputationLogEntry = replacementReputationUpdateLog[_reputationMiningCycle][_id];
  }

  function getReplacementReputationUpdateLogsExist(address _reputationMiningCycle) public view returns (bool) {
    return replacementReputationUpdateLogsExist[_reputationMiningCycle];
  }

  function setReputationRootHash(bytes32 newHash, uint256 newNNodes, address[] memory stakers, uint256 reward) public
  stoppable
  onlyReputationMiningCycle
  {
    reputationRootHash = newHash;
    reputationRootHashNNodes = newNNodes;
    // Reward stakers
    activeReputationMiningCycle = address(0x0);
    startNextCycle();
    rewardStakers(stakers, reward);

    emit ReputationRootHashSet(newHash, newNNodes, stakers, reward);
  }

  function initialiseReputationMining() public stoppable {
    require(inactiveReputationMiningCycle == address(0x0), "colony-reputation-mining-already-initialised");
    address clnyToken = IMetaColony(metaColony).getToken();
    require(clnyToken != address(0x0), "colony-reputation-mining-clny-token-invalid-address");

    EtherRouter e = new EtherRouter();
    e.setResolver(miningCycleResolver);
    inactiveReputationMiningCycle = address(e);
    IReputationMiningCycle(inactiveReputationMiningCycle).initialise(tokenLocking, clnyToken);

    emit ReputationMiningInitialised(inactiveReputationMiningCycle);
  }

  function startNextCycle() public stoppable {
    address clnyToken = IMetaColony(metaColony).getToken();
    require(clnyToken != address(0x0), "colony-reputation-mining-clny-token-invalid-address");
    require(activeReputationMiningCycle == address(0x0), "colony-reputation-mining-still-active");
    require(inactiveReputationMiningCycle != address(0x0), "colony-reputation-mining-not-initialised");
    // Inactive now becomes active
    activeReputationMiningCycle = inactiveReputationMiningCycle;
    IReputationMiningCycle(activeReputationMiningCycle).resetWindow();

    EtherRouter e = new EtherRouter();
    e.setResolver(miningCycleResolver);
    inactiveReputationMiningCycle = address(e);
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
  uint256 constant T = 7776000 * WAD; // Seconds in 90 days * WAD
  uint256 constant N = 24 * WAD; // 2x maximum number of miners * WAD
  uint256 constant UINT32_MAX = 4294967295;
  uint256 constant MAX_MINERS = 12;

  function calculateMinerWeight(uint256 timeStaked, uint256 submissonIndex) public pure returns (uint256) {
    if (submissonIndex >= MAX_MINERS) {
      return 0;
    }

    uint256 timeStakedMax = min(timeStaked, UINT32_MAX); // Maximum of ~136 years (uint32)

    // (1 - exp{-t_n/T}) * (1 - (n-1)/N), 3rd degree Taylor expansion for exponential term
    uint256 tnDivT = wdiv(timeStakedMax * WAD, T);
    uint256 expTnDivT = add(add(add(WAD, tnDivT), wmul(tnDivT, tnDivT) / 2), wmul(wmul(tnDivT, tnDivT), tnDivT) / 6);
    uint256 stakeTerm = sub(WAD, wdiv(WAD, expTnDivT));
    uint256 submissionTerm = sub(WAD, wdiv(submissonIndex * WAD, N));
    return wmul(stakeTerm, submissionTerm);
  }

  function rewardStakers(address[] memory stakers, uint256 reward) internal {
    // Internal unlike punish, because it's only ever called from setReputationRootHash

    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.confirmNewHash;

    uint256 i;
    address clnyToken = IMetaColony(metaColony).getToken();

    // I. Calculate (normalized) miner weights and realReward
    uint256 timeStaked;
    uint256 minerWeightsTotal;
    uint256[] memory minerWeights = new uint256[](stakers.length);

    for (i = 0; i < stakers.length; i++) {
      timeStaked = ITokenLocking(tokenLocking).getUserLock(clnyToken, stakers[i]).timestamp;
      minerWeights[i] = calculateMinerWeight(now - timeStaked, i);
      minerWeightsTotal = add(minerWeightsTotal, minerWeights[i]);
    }

    uint256 realReward; // Used to prevent dust buildup due to small imprecisions in WAD arithmetic.
    for (i = 0; i < stakers.length; i++) {
      minerWeights[i] = wdiv(minerWeights[i], minerWeightsTotal);
      realReward += wmul(reward, minerWeights[i]);
    }

    // II. Disburse reputation and tokens
    IMetaColony(metaColony).mintTokensForColonyNetwork(realReward);

    for (i = 0; i < stakers.length; i++) {
      assert(ERC20Extended(clnyToken).transfer(stakers[i], wmul(reward, minerWeights[i])));
    }

    // This gives them reputation in the next update cycle.
    IReputationMiningCycle(inactiveReputationMiningCycle).rewardStakersWithReputation(
      stakers,
      minerWeights,
      metaColony,
      realReward,
      reputationMiningSkillId
    );
  }
}
