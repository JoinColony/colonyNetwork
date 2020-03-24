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

import "./../../lib/dappsys/math.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./ReputationMiningCycleStorage.sol";


contract ReputationMiningCycleCommon is ReputationMiningCycleStorage, PatriciaTreeProofs, DSMath {
  /// @notice Minimum reputation mining stake in CLNY
  uint256 constant MIN_STAKE = 2000 * WAD;
  /// @notice Size of mining window in seconds
  uint256 constant MINING_WINDOW_SIZE = 60 * 60 * 24; // 24 hours

  function rewardResponder(address _responder) internal returns (bytes32) {
    respondedToChallenge[_responder] = true;
    uint256 reward = disputeRewardSize();
    IColonyNetwork(colonyNetworkAddress).reward(_responder, reward);
    rewardsPaidOut += reward;
  }

  function submissionWindowClosed() internal view returns (bool) {
    return now - reputationMiningWindowOpenTimestamp >= MINING_WINDOW_SIZE;
  }

  function disputeRewardSize() internal returns (uint256) {
    // TODO: Is this worth calculating once, and then saving? Seems quite likely.
    uint256 nLogEntries = reputationUpdateLog.length;

    // If there's no log, it must be one of the first two reputation cycles - no reward.
    if (nLogEntries == 0) {
      return 0;
    }

    // No dispute, so no dispute reward
    if (nUniqueSubmittedHashes <= 1) {
      return 0;
    }

    if (cachedDisputeRewardSize != 0 ) {
      // Then we've already calculated it! Just return it
      return cachedDisputeRewardSize;
    }

    // Otherwise, calculate it

    uint256 reputationRootHashNLeaves = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNLeaves();
    uint jrhNLeaves = reputationUpdateLog[nLogEntries-1].nUpdates +
      reputationUpdateLog[nLogEntries-1].nPreviousUpdates + reputationRootHashNLeaves + 1; // This is the number of leaves we expect in the justification tree

    uint256 nByes = log2Ceiling(nUniqueSubmittedHashes); // We can have at most one bye per round, and this is the maximum number of rounds

    // The maximum number of responses that need rewards
    uint256 rewardDenominator = nByes + (nUniqueSubmittedHashes - 1) * (2 * (3 + log2Ceiling(jrhNLeaves)) + 1);

    // The minimum amount of stake to be lost
    uint256 rewardNumerator = MIN_STAKE * (nUniqueSubmittedHashes - 1);
    uint256 reward = rewardNumerator / rewardDenominator;

    if (submissionWindowClosed()) {
      // Store it for next time if it's not going to change further.
      cachedDisputeRewardSize = reward;
    }

    return reward;
  }

  // https://ethereum.stackexchange.com/questions/8086/logarithm-math-operation-in-solidity
  // Some impressive de Bruijn sequence magic here...
  function log2Ceiling(uint x) internal pure returns (uint y) {
    assembly {
        let arg := x
        x := sub(x,1)
        x := or(x, div(x, 0x02))
        x := or(x, div(x, 0x04))
        x := or(x, div(x, 0x10))
        x := or(x, div(x, 0x100))
        x := or(x, div(x, 0x10000))
        x := or(x, div(x, 0x100000000))
        x := or(x, div(x, 0x10000000000000000))
        x := or(x, div(x, 0x100000000000000000000000000000000))
        x := add(x, 1)
        let m := mload(0x40)
        mstore(m,           0xf8f9cbfae6cc78fbefe7cdc3a1793dfcf4f0e8bbd8cec470b6a28a7a5a3e1efd)
        mstore(add(m,0x20), 0xf5ecf1b3e9debc68e1d9cfabc5997135bfb7a7a3938b7b606b5b4b3f2f1f0ffe)
        mstore(add(m,0x40), 0xf6e4ed9ff2d6b458eadcdf97bd91692de2d4da8fd2d0ac50c6ae9a8272523616)
        mstore(add(m,0x60), 0xc8c0b887b0a8a4489c948c7f847c6125746c645c544c444038302820181008ff)
        mstore(add(m,0x80), 0xf7cae577eec2a03cf3bad76fb589591debb2dd67e0aa9834bea6925f6a4a2e0e)
        mstore(add(m,0xa0), 0xe39ed557db96902cd38ed14fad815115c786af479b7e83247363534337271707)
        mstore(add(m,0xc0), 0xc976c13bb96e881cb166a933a55e490d9d56952b8d4e801485467d2362422606)
        mstore(add(m,0xe0), 0x753a6d1b65325d0c552a4d1345224105391a310b29122104190a110309020100)
        mstore(0x40, add(m, 0x100))
        let magic := 0x818283848586878898a8b8c8d8e8f929395969799a9b9d9e9faaeb6bedeeff
        let shift := 0x100000000000000000000000000000000000000000000000000000000000000
        let a := div(mul(x, magic), shift)
        y := div(mload(add(m,sub(255,a))), shift)
        y := add(y, mul(256, gt(arg, 0x8000000000000000000000000000000000000000000000000000000000000000)))
    }
  }

  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant SUBMITTER_ONLY_WINDOW = 60*10;
  uint256 constant Y = UINT256_MAX / SUBMITTER_ONLY_WINDOW;

  function responsePossible(disputeStages stage, uint256 since) internal view returns (bool) {
    if (now < since) return false;
    if (now - since < SUBMITTER_ONLY_WINDOW) {
      // require user made a submission
      if (reputationHashSubmissions[msg.sender].proposedNewRootHash == bytes32(0x00)){
        return false;
      }
      uint256 target = (now - since) * Y;
      if (uint256(keccak256(abi.encodePacked(msg.sender, stage))) > target){
        return false;
      }
    }
    return true;
  }

  function nextPowerOfTwoInclusive(uint256 v) internal pure returns (uint) { // solium-disable-line security/no-assign-params
    // Returns the next power of two, or v if v is already a power of two.
    // Doesn't work for zero.
    v = sub(v, 1);
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    v |= v >> 32;
    v |= v >> 64;
    v |= v >> 128;
    v = add(v, 1);
    return v;
  }

  function expectedProofLength(uint256 nNodes, uint256 node) internal pure returns (uint256) { // solium-disable-line security/no-assign-params
    nNodes -= 1;
    uint256 nextPowerOfTwo = nextPowerOfTwoInclusive(nNodes + 1);
    uint256 layers = 0;
    while (nNodes != 0 && (node+1 > nextPowerOfTwo / 2)) {
      nNodes -= nextPowerOfTwo/2;
      node -= nextPowerOfTwo/2;
      layers += 1;
      nextPowerOfTwo = nextPowerOfTwoInclusive(nNodes + 1);
    }
    while (nextPowerOfTwo > 1) {
      layers += 1;
      nextPowerOfTwo >>= 1;
    }
    return layers;
  }

  function opponentIdx(uint256 _idx) internal pure returns (uint256) {
    return _idx % 2 == 1 ? _idx - 1 : _idx + 1;
  }

  function expectedBranchMask(uint256 nNodes, uint256 node) public pure returns (uint256) {
    // Gets the expected branchmask for a patricia tree which has nNodes, with keys from 0 to nNodes -1
    // i.e. the tree is 'full' - there are no missing nodes
    uint256 mask = sub(nNodes, 1); // Every branchmask in a full tree has at least these 1s set
    uint256 xored = mask ^ node; // Where do mask and node differ?
    // Set every bit in the mask from the first bit where they differ to 1
    uint256 remainderMask = sub(nextPowerOfTwoInclusive(add(xored, 1)), 1);
    return mask | remainderMask;
  }
}