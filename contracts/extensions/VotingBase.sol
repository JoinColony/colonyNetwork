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
pragma experimental ABIEncoderV2;

import "../../lib/dappsys/math.sol";
import "../IColony.sol";
import "../IColonyNetwork.sol";


contract VotingBase is DSMath {

  // Constants
  uint256 constant REVEAL_PERIOD = 2 days;

  // Initialization data
  IColony colony;
  IColonyNetwork colonyNetwork;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
  }

  // Data structures
  enum PollState { Open, Reveal, Closed }

  struct Poll {
    uint256 pollCloses;
    uint256[] voteCounts;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;

  // Functions
  function getPollCount() public view returns (uint256) {
    return pollCount;
  }

  function getPollInfo(uint256 _pollId) public view returns (Poll memory poll) {
    poll = polls[_pollId];
  }

  function getPollState(uint256 _pollId) internal view returns (PollState) {
    if (now < polls[_pollId].pollCloses) {
      return PollState.Open;
    } else if (now < add(polls[_pollId].pollCloses, REVEAL_PERIOD)) {
      return PollState.Reveal;
    } else {
      return PollState.Closed;
    }
  }

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }
}
