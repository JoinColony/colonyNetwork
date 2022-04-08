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

import "./../../lib/dappsys/math.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../tokenLocking/ITokenLocking.sol";
import "./ReputationMiningCycleStorage.sol";


contract ReputationMiningCycleCommon is ReputationMiningCycleStorage, PatriciaTreeProofs, DSMath {
  // Minimum reputation mining stake in CLNY
  uint256 constant MIN_STAKE = 2000 * WAD;
  // Size of mining window in seconds. Should be consistent with decay constant
  // in reputationMiningCycleRespond. If you change one, you should change the other.
  uint256 constant MINING_WINDOW_SIZE = 60 * 60 * 1; // 1 hour
  uint256 constant ALL_ENTRIES_ALLOWED_END_OF_WINDOW = 60 * 10; // 10 minutes

  function getMinerAddressIfStaked() internal view returns (address) {
    // Is msg.sender a miner themselves? See if they have stake.
    uint256 stakedForMining = IColonyNetwork(colonyNetworkAddress).getMiningStake(msg.sender).amount;
    if (stakedForMining > 0) {
      // If so, they we don't let them mine on someone else's behalf
      return msg.sender;
    }

    // Return any delegator they are acting on behalf of
    address delegator = IColonyNetwork(colonyNetworkAddress).getMiningDelegator(msg.sender);
    require(delegator != address(0x00), "colony-reputation-mining-no-stake-or-delegator");
    return delegator;
  }

  function expectedBranchMask(uint256 _nLeaves, uint256 _leaf) public pure returns (uint256) {
    // Gets the expected branchmask for a patricia tree which has nLeaves, with keys from 0 to nLeaves -1
    // i.e. the tree is 'full' - there are no missing leaves
    uint256 mask = sub(_nLeaves, 1); // Every branchmask in a full tree has at least these 1s set
    uint256 xored = mask ^ _leaf; // Where do mask and leaf differ?
    // Set every bit in the mask from the first bit where they differ to 1
    uint256 remainderMask = sub(nextPowerOfTwoInclusive(add(xored, 1)), 1);
    return mask | remainderMask;
  }

  function rewardResponder(address _responder) internal returns (bytes32) {
    respondedToChallenge[_responder] = true;
    uint256 reward = disputeRewardSize();
    IColonyNetwork(colonyNetworkAddress).reward(_responder, reward);
    rewardsPaidOut += reward;
  }

  function submissionWindowClosed() internal view returns (bool) {
    return block.timestamp - reputationMiningWindowOpenTimestamp >= MINING_WINDOW_SIZE;
  }

  function disputeRewardSize() internal returns (uint256) {
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
  function log2Ceiling(uint _x) internal pure returns (uint y) {
    assembly {
        let arg := _x
        _x := sub(_x,1)
        _x := or(_x, div(_x, 0x02))
        _x := or(_x, div(_x, 0x04))
        _x := or(_x, div(_x, 0x10))
        _x := or(_x, div(_x, 0x100))
        _x := or(_x, div(_x, 0x10000))
        _x := or(_x, div(_x, 0x100000000))
        _x := or(_x, div(_x, 0x10000000000000000))
        _x := or(_x, div(_x, 0x100000000000000000000000000000000))
        _x := add(_x, 1)
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
        let a := div(mul(_x, magic), shift)
        y := div(mload(add(m,sub(255,a))), shift)
        y := add(y, mul(256, gt(arg, 0x8000000000000000000000000000000000000000000000000000000000000000)))
    }
  }

  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant CHALLENGE_RESPONSE_WINDOW_DURATION = 60 * 20;
  uint256 constant Y = UINT256_MAX / (CHALLENGE_RESPONSE_WINDOW_DURATION - ALL_ENTRIES_ALLOWED_END_OF_WINDOW);

  function responsePossible(DisputeStages _stage, uint256 _responseWindowOpened) internal view returns (bool) {
    if (_responseWindowOpened > block.timestamp) {
      // I don't think this is currently possible, but belt and braces!
      return false;
    }

    address minerAddress = getMinerAddressIfStaked();

    uint256 windowOpenFor = block.timestamp - _responseWindowOpened;

    if (windowOpenFor <= CHALLENGE_RESPONSE_WINDOW_DURATION - ALL_ENTRIES_ALLOWED_END_OF_WINDOW) {
      // require user made a submission
      if (reputationHashSubmissions[minerAddress].proposedNewRootHash == bytes32(0x00)) {
        return false;
      }
      uint256 target = windowOpenFor * Y;
      if (uint256(keccak256(abi.encodePacked(minerAddress, _stage))) > target) {
        return false;
      }
    }
    return true;
  }

  function nextPowerOfTwoInclusive(uint256 _v) internal pure returns (uint) { // solium-disable-line security/no-assign-params
    // Returns the next power of two, or v if v is already a power of two.
    // Doesn't work for zero.
    _v = sub(_v, 1);
    _v |= _v >> 1;
    _v |= _v >> 2;
    _v |= _v >> 4;
    _v |= _v >> 8;
    _v |= _v >> 16;
    _v |= _v >> 32;
    _v |= _v >> 64;
    _v |= _v >> 128;
    _v = add(_v, 1);
    return _v;
  }

  function expectedProofLength(uint256 _nNodes, uint256 _node) internal pure returns (uint256) { // solium-disable-line security/no-assign-params
    _nNodes -= 1;
    uint256 nextPowerOfTwo = nextPowerOfTwoInclusive(_nNodes + 1);
    uint256 layers = 0;
    while (_nNodes != 0 && (_node+1 > nextPowerOfTwo / 2)) {
      _nNodes -= nextPowerOfTwo/2;
      _node -= nextPowerOfTwo/2;
      layers += 1;
      nextPowerOfTwo = nextPowerOfTwoInclusive(_nNodes + 1);
    }
    while (nextPowerOfTwo > 1) {
      layers += 1;
      nextPowerOfTwo >>= 1;
    }
    return layers;
  }

  function getOpponentIdx(uint256 _idx) internal pure returns (uint256) {
    return _idx % 2 == 1 ? _idx - 1 : _idx + 1;
  }
}