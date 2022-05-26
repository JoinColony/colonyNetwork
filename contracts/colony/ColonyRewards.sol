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

pragma solidity 0.7.3;
pragma experimental "ABIEncoderV2";

import "./../tokenLocking/ITokenLocking.sol";
import "./ColonyStorage.sol";


contract ColonyRewards is ColonyStorage, PatriciaTreeProofs { // ignore-swc-123
  function lockToken() public stoppable onlyOwnExtension returns (uint256) {
    uint256 lockId = ITokenLocking(tokenLockingAddress).lockToken(token);
    tokenLocks[msgSender()][lockId] = true;
    return lockId;
  }

  function unlockTokenForUser(address _user, uint256 _lockId) public stoppable onlyOwnExtension {
    require(tokenLocks[msgSender()][_lockId], "colony-bad-lock-id");
    ITokenLocking(tokenLockingAddress).unlockTokenForUser(token, _user, _lockId);
  }

  function startNextRewardPayout(address _token, bytes memory key, bytes memory value, uint256 branchMask, bytes32[] memory siblings)
  public stoppable auth
  {
    ITokenLocking tokenLocking = ITokenLocking(tokenLockingAddress);
    uint256 totalLockCount = tokenLocking.lockToken(token);
    uint256 thisPayoutAmount = sub(fundingPots[0].balance[_token], pendingRewardPayments[_token]);
    require(thisPayoutAmount > 0, "colony-reward-payout-no-rewards");
    pendingRewardPayments[_token] = add(pendingRewardPayments[_token], thisPayoutAmount);

    uint256 totalTokens = sub(ERC20Extended(token).totalSupply(), ERC20Extended(token).balanceOf(address(this)));
    require(totalTokens > 0, "colony-reward-payout-invalid-total-tokens");

    bytes32 rootHash = IColonyNetwork(colonyNetworkAddress).getReputationRootHash();
    uint256 colonyWideReputation = checkReputation(
      rootHash,
      domains[1].skillId,
      address(0x0),
      key,
      value,
      branchMask,
      siblings
    );
    require(colonyWideReputation > 0, "colony-reward-payout-invalid-colony-wide-reputation");

    rewardPayoutCycles[totalLockCount] = RewardPayoutCycle(
      rootHash,
      colonyWideReputation,
      totalTokens,
      thisPayoutAmount,
      _token,
      block.timestamp,
      thisPayoutAmount,
      false
    );

    emit RewardPayoutCycleStarted(msgSender(), totalLockCount);
  }

  // slither-disable-next-line reentrancy-no-eth
  function claimRewardPayout(
    uint256 _payoutId,
    uint256[7] memory _squareRoots,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) public stoppable
  {
    uint256 userReputation = checkReputation(
      rewardPayoutCycles[_payoutId].reputationState,
      domains[1].skillId,
      msgSender(),
      key,
      value,
      branchMask,
      siblings
    );

    address tokenAddress;
    uint256 reward;
    (tokenAddress, reward) = calculateRewardForUser(_payoutId, _squareRoots, userReputation);

    ITokenLocking(tokenLockingAddress).unlockTokenForUser(token, msgSender(), _payoutId);

    uint fee = calculateNetworkFeeForPayout(reward);
    uint remainder = sub(reward, fee);

    fundingPots[0].balance[tokenAddress] = sub(fundingPots[0].balance[tokenAddress], reward);
    pendingRewardPayments[rewardPayoutCycles[_payoutId].tokenAddress] = sub(
      pendingRewardPayments[rewardPayoutCycles[_payoutId].tokenAddress],
      reward
    );
    rewardPayoutCycles[_payoutId].amountRemaining = sub(rewardPayoutCycles[_payoutId].amountRemaining, reward);

    assert(ERC20Extended(tokenAddress).transfer(msgSender(), remainder));
    assert(ERC20Extended(tokenAddress).transfer(colonyNetworkAddress, fee));

    emit RewardPayoutClaimed(_payoutId, msgSender(), fee, remainder);
  }

  function finalizeRewardPayout(uint256 _payoutId) public stoppable {
    RewardPayoutCycle memory payout = rewardPayoutCycles[_payoutId];
    require(payout.reputationState != 0x00, "colony-reward-payout-does-not-exist");
    require(!payout.finalized, "colony-reward-payout-already-finalized");
    require(block.timestamp - payout.blockTimestamp > 60 days, "colony-reward-payout-active");

    rewardPayoutCycles[_payoutId].finalized = true;
    pendingRewardPayments[payout.tokenAddress] = sub(pendingRewardPayments[payout.tokenAddress], payout.amountRemaining);

    emit RewardPayoutCycleEnded(msgSender(), _payoutId);
  }

  function getRewardPayoutInfo(uint256 _payoutId) public view returns (RewardPayoutCycle memory rewardPayoutCycle) {
    rewardPayoutCycle = rewardPayoutCycles[_payoutId];
  }

  function setRewardInverse(uint256 _rewardInverse) public
  stoppable
  auth
  {
    require(_rewardInverse > 0, "colony-reward-inverse-cannot-be-zero");
    rewardInverse = _rewardInverse;

    emit ColonyRewardInverseSet(msgSender(), _rewardInverse);
  }

  function checkReputation(
    bytes32 rootHash,
    uint256 skillId,
    address userAddress,
    bytes memory key,
    bytes memory value,
    uint256 branchMask,
    bytes32[] memory siblings
  ) internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(key, value, branchMask, siblings);
    require(rootHash == impliedRoot, "colony-reputation-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkill;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(value, 32))
      keyColonyAddress := mload(add(key, 20))
      keySkill := mload(add(key, 52))
      keyUserAddress := mload(add(key, 72))
    }

    require(keyColonyAddress == address(this), "colony-reputation-invalid-colony-address");
    require(keySkill == skillId, "colony-reputation-invalid-skill-id");
    require(keyUserAddress == userAddress, "colony-reputation-invalid-user-address");

    return reputationValue;
  }

  function calculateRewardForUser(uint256 payoutId, uint256[7] memory squareRoots, uint256 userReputation) internal returns (address, uint256) {
    RewardPayoutCycle memory payout = rewardPayoutCycles[payoutId];

    // Checking if payout is active
    require(block.timestamp - payout.blockTimestamp <= 60 days, "colony-reward-payout-not-active");

    uint256 userTokens = ITokenLocking(tokenLockingAddress).getUserLock(token, msgSender()).balance;
    require(userTokens > 0, "colony-reward-payout-invalid-user-tokens");
    require(userReputation > 0, "colony-reward-payout-invalid-user-reputation");

    // squareRoots[0] - square root of userReputation
    // squareRoots[1] - square root of userTokens (deposited in TokenLocking)
    // squareRoots[2] - square root of payout.colonyWideReputation
    // squareRoots[3] - square root of totalTokens
    // squareRoots[4] - square root of numerator
    // squareRoots[5] - square root of denominator
    // squareRoots[6] - square root of payout.amount

    require(mul(squareRoots[0], squareRoots[0]) <= userReputation, "colony-reward-payout-invalid-parameter-user-reputation");
    require(mul(squareRoots[1], squareRoots[1]) <= userTokens, "colony-reward-payout-invalid-parameter-user-token");
    require(mul(squareRoots[2], squareRoots[2]) >= payout.colonyWideReputation, "colony-reward-payout-invalid-parameter-total-reputation");
    require(mul(squareRoots[3], squareRoots[3]) >= payout.totalTokens, "colony-reward-payout-invalid-parameter-total-tokens");
    require(mul(squareRoots[6], squareRoots[6]) <= payout.amount, "colony-reward-payout-invalid-parameter-amount");
    uint256 numerator = mul(squareRoots[0], squareRoots[1]);
    uint256 denominator = mul(squareRoots[2], squareRoots[3]);

    require(mul(squareRoots[4], squareRoots[4]) <= numerator, "colony-reward-payout-invalid-parameter-numerator");
    require(mul(squareRoots[5], squareRoots[5]) >= denominator, "colony-reward-payout-invalid-parameter-denominator");

    uint256 reward = (mul(squareRoots[4], squareRoots[6]) / squareRoots[5]) ** 2;

    return (payout.tokenAddress, reward);
  }
}