// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.25;
pragma experimental "ABIEncoderV2";

import { ERC20Extended } from "./../common/ERC20Extended.sol";
import { EtherRouter } from "./../common/EtherRouter.sol";
import { MultiChain } from "./../common/MultiChain.sol";
import { IReputationMiningCycle } from "./../reputationMiningCycle/IReputationMiningCycle.sol";
import { ITokenLocking } from "./../tokenLocking/ITokenLocking.sol";
import { ColonyNetworkStorage } from "./ColonyNetworkStorage.sol";
import { IMetaColony } from "./../colony/IMetaColony.sol";
import { IColonyBridge } from "./../bridging/IColonyBridge.sol";
import { IColonyNetwork } from "./IColonyNetwork.sol";
import { ColonyDataTypes } from "./../colony/ColonyDataTypes.sol";

contract ColonyNetworkMining is ColonyNetworkStorage {
  // TODO: Can we handle a dispute regarding the very first hash that should be set?

  modifier onlyReputationMiningCycle() {
    require(
      msgSender() == activeReputationMiningCycle,
      "colony-reputation-mining-sender-not-active-reputation-cycle"
    );
    _;
  }

  function setMiningDelegate(address _delegate, bool _allowed) public onlyMiningChain stoppable {
    if (miningDelegators[_delegate] != address(0x00)) {
      require(
        miningDelegators[_delegate] == msgSender(),
        "colony-reputation-mining-not-your-delegate"
      );
    }

    if (_allowed) {
      miningDelegators[_delegate] = msgSender();
    } else {
      miningDelegators[_delegate] = address(0x00);
    }
  }

  function getMiningDelegator(address _delegate) external view onlyMiningChain returns (address) {
    return miningDelegators[_delegate];
  }

  function setReplacementReputationUpdateLogEntry(
    address _reputationMiningCycle,
    uint256 _id,
    address _user,
    int _amount,
    uint256 _skillId,
    address _colony,
    uint128 _nUpdates,
    uint128 _nPreviousUpdates
  ) public onlyMiningChain recovery auth {
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

  function getReplacementReputationUpdateLogEntry(
    address _reputationMiningCycle,
    uint256 _id
  ) public view onlyMiningChain returns (ReputationLogEntry memory reputationLogEntry) {
    reputationLogEntry = replacementReputationUpdateLog[_reputationMiningCycle][_id];
  }

  function getReplacementReputationUpdateLogsExist(
    address _reputationMiningCycle
  ) public view onlyMiningChain returns (bool) {
    return replacementReputationUpdateLogsExist[_reputationMiningCycle];
  }

  // Well this is a weird hack to need
  function newAddressArray() internal pure returns (address[] memory) {}

  function setReputationRootHashFromBridge(
    bytes32 _newHash,
    uint256 _newNLeaves,
    uint256 _nonce
  ) public stoppable onlyNotMiningChain onlyColonyBridge {
    require(
      _nonce >= bridgeCurrentRootHashNonces[block.chainid],
      "colony-mining-bridge-invalid-nonce"
    );
    bridgeCurrentRootHashNonces[block.chainid] = _nonce;
    reputationRootHash = _newHash;
    reputationRootHashNLeaves = _newNLeaves;

    emit ReputationRootHashSet(_newHash, _newNLeaves, newAddressArray(), 0);
  }

  function bridgeCurrentRootHash(uint256 _chainId) public onlyMiningChain stoppable {
    require(colonyBridgeAddress != address(0x0), "colony-network-bridge-not-set");

    bridgeCurrentRootHashNonces[_chainId] += 1;

    bytes memory payload = abi.encodeWithSignature(
      "setReputationRootHashFromBridge(bytes32,uint256,uint256)",
      reputationRootHash,
      reputationRootHashNLeaves,
      bridgeCurrentRootHashNonces[_chainId]
    );

    // slither-disable-next-line unchecked-lowlevel
    bool success = IColonyBridge(colonyBridgeAddress).sendMessage(_chainId, payload);
    // We require success so estimation calls can tell us if bridging is going to work
    require(success, "colony-mining-bridge-call-failed");
  }

  function setReputationRootHash(
    bytes32 newHash,
    uint256 newNLeaves,
    address[] memory stakers
  ) public onlyMiningChain stoppable onlyReputationMiningCycle {
    reputationRootHash = newHash;
    reputationRootHashNLeaves = newNLeaves;
    // Reward stakers
    activeReputationMiningCycle = address(0x0);
    startNextCycle();
    rewardStakers(stakers);

    emit ReputationRootHashSet(newHash, newNLeaves, stakers, totalMinerRewardPerCycle);
  }

  // slither-disable-next-line reentrancy-no-eth
  function initialiseReputationMining(
    uint256 _reputationMiningChainId,
    bytes32 _newHash,
    uint256 _newNLeaves
  ) public stoppable calledByMetaColony {
    require(
      (reputationMiningChainId == 0) || // Either it's the first time setting it
        // Or we're moving from a chain that's not this chain to another chain that's not this one
        (reputationMiningChainId != block.chainid && _reputationMiningChainId != block.chainid),
      "colony-reputation-mining-already-initialised"
    );
    reputationMiningChainId = _reputationMiningChainId;

    if (reputationMiningChainId != block.chainid) {
      // Reputation mining is on another chain, so we will need to set up the bridge
      // But we're done here for now other than making sure everything is unset
      reputationMiningSkillId = 0;
      inactiveReputationMiningCycle = address(0x0);
      activeReputationMiningCycle = address(0x0);
      return;
    }

    address clnyToken = IMetaColony(metaColony).getToken();
    require(clnyToken != address(0x0), "colony-reputation-mining-clny-token-invalid-address");

    // Add the special mining skill
    ColonyDataTypes.Domain memory d = IMetaColony(metaColony).getDomain(1);

    reputationMiningSkillId = IColonyNetwork(address(this)).addSkill(d.skillId);

    EtherRouter e = new EtherRouter();
    e.setResolver(miningCycleResolver);
    inactiveReputationMiningCycle = address(e);
    IReputationMiningCycle(inactiveReputationMiningCycle).initialise(tokenLocking, clnyToken);

    emit ReputationMiningInitialised(inactiveReputationMiningCycle);

    reputationRootHash = _newHash;
    reputationRootHashNLeaves = _newNLeaves;

    emit ReputationRootHashSet(_newHash, _newNLeaves, newAddressArray(), 0);

    startNextCycle();
  }

  // slither-disable-next-line reentrancy-no-eth
  function startNextCycle() public onlyMiningChain stoppable {
    address clnyToken = IMetaColony(metaColony).getToken();
    require(clnyToken != address(0x0), "colony-reputation-mining-clny-token-invalid-address");
    require(activeReputationMiningCycle == address(0x0), "colony-reputation-mining-still-active");
    // Inactive now becomes active
    activeReputationMiningCycle = inactiveReputationMiningCycle;
    IReputationMiningCycle(activeReputationMiningCycle).resetWindow();

    EtherRouter e = new EtherRouter();
    e.setResolver(miningCycleResolver);
    inactiveReputationMiningCycle = address(e);
    IReputationMiningCycle(inactiveReputationMiningCycle).initialise(tokenLocking, clnyToken);
    emit ReputationMiningCycleComplete(reputationRootHash, reputationRootHashNLeaves);
  }

  function getReputationMiningCycle(bool _active) public view onlyMiningChain returns (address) {
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

  function calculateMinerWeight(
    uint256 timeStaked,
    uint256 submissonIndex
  ) public view onlyMiningChain returns (uint256) {
    if (submissonIndex >= MAX_MINERS) {
      return 0;
    }

    uint256 timeStakedMax = min(timeStaked, UINT32_MAX); // Maximum of ~136 years (uint32)

    // (1 - exp{-t_n/T}) * (1 - (n-1)/N), 3rd degree Taylor expansion for exponential term
    uint256 tnDivT = wdiv(timeStakedMax * WAD, T);
    uint256 expTnDivT = (((WAD + tnDivT) + wmul(tnDivT, tnDivT) / 2) +
      wmul(wmul(tnDivT, tnDivT), tnDivT) /
      6);
    uint256 stakeTerm = WAD - wdiv(WAD, expTnDivT);
    uint256 submissionTerm = WAD - wdiv(submissonIndex * WAD, N);
    return wmul(stakeTerm, submissionTerm);
  }

  function rewardStakers(address[] memory stakers) internal {
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
      timeStaked = miningStakes[stakers[i]].timestamp;
      minerWeights[i] = calculateMinerWeight(block.timestamp - timeStaked, i);
      minerWeightsTotal += minerWeights[i];
    }

    uint256 realReward; // Used to prevent dust buildup due to small imprecisions in WAD arithmetic.
    for (i = 0; i < stakers.length; i++) {
      minerWeights[i] = wdiv(minerWeights[i], minerWeightsTotal);
      realReward += wmul(totalMinerRewardPerCycle, minerWeights[i]);
    }

    // II. Disburse reputation and tokens
    // slither-disable-next-line unused-return
    ERC20Extended(clnyToken).approve(tokenLocking, realReward);

    for (i = 0; i < stakers.length; i++) {
      ITokenLocking(tokenLocking).depositFor(
        clnyToken,
        wmul(totalMinerRewardPerCycle, minerWeights[i]),
        stakers[i]
      );
    }

    // This gives them reputation in the next update cycle.
    IReputationMiningCycle(inactiveReputationMiningCycle).rewardStakersWithReputation(
      stakers,
      minerWeights,
      metaColony,
      totalMinerRewardPerCycle,
      reputationMiningSkillId
    );
  }

  function punishStakers(
    address[] memory _stakers,
    uint256 _amount
  ) public onlyMiningChain stoppable onlyReputationMiningCycle {
    address clnyToken = IMetaColony(metaColony).getToken();
    uint256 lostStake;
    // Passing an array so that we don't incur the EtherRouter overhead for each staker if we looped over
    // it in ReputationMiningCycle.invalidateHash;
    for (uint256 i; i < _stakers.length; i++) {
      lostStake = min(miningStakes[_stakers[i]].amount, _amount);
      miningStakes[_stakers[i]].amount -= lostStake;
    }

    ITokenLocking(tokenLocking).deposit(clnyToken, 0, true); // Faux deposit to clear any locks
    // Do all the external calls after all the storage changes
    for (uint256 i; i < _stakers.length; i++) {
      ITokenLocking(tokenLocking).transferStake(_stakers[i], lostStake, clnyToken, address(this));
      // TODO: Lose rep?
      emit ReputationMinerPenalised(_stakers[i], lostStake);
    }
  }

  function reward(
    address _recipient,
    uint256 _amount
  ) public onlyMiningChain stoppable onlyReputationMiningCycle {
    // TODO: Gain rep?
    pendingMiningRewards[_recipient] += _amount;
  }

  function claimMiningReward(address _recipient) public onlyMiningChain stoppable {
    address clnyToken = IMetaColony(metaColony).getToken();
    uint256 amount = pendingMiningRewards[_recipient];
    pendingMiningRewards[_recipient] = 0;
    ITokenLocking(tokenLocking).transfer(clnyToken, amount, _recipient, true);
  }

  function stakeForMining(uint256 _amount) public onlyMiningChainOrDuringSetup stoppable {
    address clnyToken = IMetaColony(metaColony).getToken();

    ITokenLocking(tokenLocking).approveStake(msgSender(), _amount, clnyToken);
    ITokenLocking(tokenLocking).obligateStake(msgSender(), _amount, clnyToken);

    miningStakes[msgSender()].timestamp = getNewTimestamp(
      miningStakes[msgSender()].amount,
      _amount,
      miningStakes[msgSender()].timestamp,
      block.timestamp
    );
    miningStakes[msgSender()].amount += _amount;
  }

  function unstakeForMining(uint256 _amount) public onlyMiningChain stoppable {
    address clnyToken = IMetaColony(metaColony).getToken();
    // Prevent those involved in a mining cycle withdrawing stake during the mining process.
    require(
      !IReputationMiningCycle(activeReputationMiningCycle).userInvolvedInMiningCycle(msgSender()),
      "colony-network-hash-submitted"
    );
    ITokenLocking(tokenLocking).deobligateStake(msgSender(), _amount, clnyToken);
    miningStakes[msgSender()].amount -= _amount;
  }

  function getMiningStake(address _user) public view onlyMiningChain returns (MiningStake memory) {
    return miningStakes[_user];
  }

  function burnUnneededRewards(
    uint256 _amount
  ) public onlyMiningChain stoppable onlyReputationMiningCycle {
    // If there are no rewards to burn, no need to do anything
    if (_amount == 0) {
      return;
    }

    address clnyToken = IMetaColony(metaColony).getToken();
    ITokenLocking(tokenLocking).withdraw(clnyToken, _amount, true);
    // We send tokens to the metacolony
    require(
      ERC20Extended(clnyToken).transfer(metaColony, _amount),
      "colony-network-transfer-failed"
    );
  }

  function setReputationMiningCycleReward(
    uint256 _amount
  ) public onlyMiningChain stoppable calledByMetaColony {
    totalMinerRewardPerCycle = _amount;

    emit ReputationMiningRewardSet(_amount);
  }

  function getReputationMiningCycleReward() public view onlyMiningChain returns (uint256) {
    return totalMinerRewardPerCycle;
  }

  uint256 constant UINT192_MAX = 2 ** 192 - 1; // Used for updating the stake timestamp

  function getNewTimestamp(
    uint256 _prevWeight,
    uint256 _currWeight,
    uint256 _prevTime,
    uint256 _currTime
  ) internal pure returns (uint256) {
    uint256 prevWeight = _prevWeight;
    uint256 currWeight = _currWeight;
    // This is the exact scenario in the docs they say this might be required - avoiding overflows
    // slither-disable-start divide-before-multiply
    // Needed to prevent overflows in the timestamp calculation
    while ((prevWeight >= UINT192_MAX) || (currWeight >= UINT192_MAX)) {
      prevWeight /= 2;
      currWeight /= 2;
    }

    return ((prevWeight * _prevTime) + (currWeight * _currTime)) / (prevWeight + currWeight);
    // slither-disable-end divide-before-multiply
  }

  function setMiningResolver(
    address _miningResolver
  ) public stoppable onlyMiningChainOrDuringSetup auth {
    require(_miningResolver != address(0x0), "colony-mining-resolver-cannot-be-zero");

    miningCycleResolver = _miningResolver;

    emit MiningCycleResolverSet(_miningResolver);
  }

  function getMiningResolver() public view returns (address) {
    return miningCycleResolver;
  }
}
