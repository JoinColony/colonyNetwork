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


contract TokenWeightedVotingStorage is DSAuth {

    address resolver;

    uint256 pollCount;

    struct Poll {
        string description;
        string pollOptionDescription;
        uint pollOptionCount;
        uint voteWeight;
        uint pollCount;
        uint pollStartTime;
        uint pollCloseTime;
        uint pollStatus;
    }

    struct Vote {
        uint claimedNextTimestamp;
        uint claimedNextPollId;
        uint pollId;
        uint prevTimestamp;
        uint prevPollId;
        uint nextTimestamp;
        uint nextPollId;
        bytes32 secret;
        uint voteCount;
    }

    mapping(uint => Poll) public polls;

    mapping(address => Vote) public votes;

}
