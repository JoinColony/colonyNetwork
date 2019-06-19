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
  enum PollState { Pending, Open, Reveal, Closed, Executed }

  struct Poll {
    bool executed;
    address creator;
    uint256 pollCloses;
    uint256[] voteCounts;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;
  mapping (uint256 => mapping (uint256 => bytes)) pollActions;

  // Modifiers
  modifier onlyCreator(uint256 _pollId) {
    require(polls[_pollId].creator == msg.sender, "voting-base-only-creator");
    _;
  }

  modifier pollPending(uint256 _pollId) {
    require(getPollState(_pollId) == PollState.Pending, "voting-base-poll-not-pending");
    _;
  }

  // Functions
  function createPoll() public {
    pollCount += 1;
    polls[pollCount].creator = msg.sender;
  }

  function addPollAction(uint256 _pollId, bytes memory _action) public onlyCreator(_pollId) pollPending(_pollId) {
    pollActions[_pollId][polls[_pollId].voteCounts.length] = _action;
    polls[_pollId].voteCounts.push(0);
  }

  function openPoll(uint256 _pollId, uint256 _duration) public onlyCreator(_pollId) pollPending(_pollId) {
    require(polls[_pollId].voteCounts.length > 1, "voting-base-insufficient-poll-actions");
    polls[_pollId].pollCloses = add(now, _duration);
  }

  function executePoll(uint256 _pollId) public returns (bool) {
    require(getPollState(_pollId) != PollState.Executed, "voting-base-poll-already-executed");
    require(getPollState(_pollId) == PollState.Closed, "voting-base-poll-not-closed");

    polls[_pollId].executed = true;

    uint256 winner = getPollWinner(_pollId);
    bytes storage action = pollActions[_pollId][winner];
    return executeCall(address(colony), action);
  }

  function getPollCount() public view returns (uint256) {
    return pollCount;
  }

  function getPollInfo(uint256 _pollId) public view returns (Poll memory poll) {
    poll = polls[_pollId];
  }

  function getPollState(uint256 _pollId) public view returns (PollState) {
    Poll storage poll = polls[_pollId];
    if (poll.pollCloses == 0) {
      return PollState.Pending;
    } else if (now < poll.pollCloses) {
      return PollState.Open;
    } else if (now < add(poll.pollCloses, REVEAL_PERIOD)) {
      return PollState.Reveal;
    } else if (!poll.executed) {
      return PollState.Closed;
    } else {
      return PollState.Executed;
    }
  }

  function getPollWinner(uint256 _pollId) public view returns (uint256 winner) {
    uint256[] storage voteCounts = polls[_pollId].voteCounts;

    // TODO: Handle ties!
    for (uint256 i; i < voteCounts.length; i += 1) {
      if (voteCounts[i] > voteCounts[winner]) {
        winner = i;
      }
    }
  }

  function executeCall(address to, bytes memory data) internal returns (bool success) {
    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,   a,  v, in,              insize,      out, outsize)
      success := call(gas, to, 0, add(data, 0x20), mload(data), 0, 0)
    }
  }

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }
}
