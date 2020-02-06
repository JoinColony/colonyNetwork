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

import "../lib/dappsys/math.sol";
import "./PatriciaTree/PatriciaTreeProofs.sol";
import "./ReputationMiningCycleStorage.sol";
import "./ITokenLocking.sol";
import "./IColonyNetwork.sol";


contract ReputationMiningCycleCommon is ReputationMiningCycleStorage, PatriciaTreeProofs, DSMath {
  /// @notice Minimum reputation mining stake in CLNY
  uint256 constant MIN_STAKE = 2000 * WAD;

  function rewardResponder(address _responder) internal returns (bytes32) {
    respondedToChallenge[_responder] = true;
    uint256 reward = disputeRewardIncrement();
    ITokenLocking(tokenLockingAddress).reward(
      _responder,
      reward
    );
    rewardsPaidOut += reward;
  }

  function disputeRewardIncrement() internal view returns (uint256) {
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

    uint256 reputationRootHashNNodes = IColonyNetwork(colonyNetworkAddress).getReputationRootHashNNodes();
    uint jrhNnodes = reputationUpdateLog[nLogEntries-1].nUpdates +
      reputationUpdateLog[nLogEntries-1].nPreviousUpdates + reputationRootHashNNodes + 1; // This is the number of nodes we expect in the justification tree

    uint256 nByes = log2Ceiling(nUniqueSubmittedHashes); // We can have at most one bye per round, and this is the maximum number of rounds

    // The maximum number of responses that need rewards
    uint256 rewardDenominator = nByes + (nUniqueSubmittedHashes-1)*(2*(3 + log2Ceiling(jrhNnodes)) + 1);

    // The minimum amount of stake to be lost
    uint256 rewardNumerator = MIN_STAKE * (nUniqueSubmittedHashes - 1);
    uint256 reward = rewardNumerator / rewardDenominator;
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


}