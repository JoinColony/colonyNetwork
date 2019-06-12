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

import "../ITokenLocking.sol";
import "./VotingBase.sol";


contract VotingToken is VotingBase {

  constructor(address _colony) public VotingBase(_colony) {}

  struct UserVote {
    uint256 pollId;
    bytes32 voteSecret;
    uint256 prevPollCloses;
    uint256 nextPollCloses;
  }

  mapping (address => mapping (uint256 => UserVote)) userVotes;

  function createPoll(uint256 _numOutcomes, uint256 _duration) public {
    pollCount += 1;

    polls[pollCount] = Poll({
      pollCloses: add(now, _duration),
      voteCounts: new uint256[](_numOutcomes)
    });
  }

  // TODO: Implement inner linked list
  function submitVote(uint256 _pollId, bytes32 _voteSecret, uint256 _prevPollCloses) public {
    require(getPollState(_pollId) == PollState.Open, "colony-token-voting-poll-not-open");

    UserVote storage prev = userVotes[msg.sender][_prevPollCloses];
    UserVote storage next = userVotes[msg.sender][prev.nextPollCloses];

    // Check we are inserting at the correct location
    uint256 pollCloses = polls[_pollId].pollCloses;
    require(pollCloses > _prevPollCloses, "colony-token-voting-insert-too-soon");
    require(pollCloses < prev.nextPollCloses || prev.nextPollCloses == 0, "colony-token-voting-insert-too-late");

    userVotes[msg.sender][pollCloses] = UserVote({
      pollId: _pollId,
      voteSecret: _voteSecret,
      prevPollCloses: _prevPollCloses,
      nextPollCloses: prev.nextPollCloses
    });

    prev.nextPollCloses = pollCloses;
    next.prevPollCloses = pollCloses;
  }

  function revealVote(uint256 _pollId, bytes32 _salt, uint256 _vote) public {
    require(getPollState(_pollId) != PollState.Open, "colony-token-voting-poll-still-open");

    uint256 pollCloses = polls[_pollId].pollCloses;
    UserVote storage curr = userVotes[msg.sender][pollCloses];
    UserVote storage prev = userVotes[msg.sender][curr.prevPollCloses];
    UserVote storage next = userVotes[msg.sender][curr.nextPollCloses];

    require(curr.voteSecret == getVoteSecret(_salt, _vote), "colony-token-voting-secret-no-match");
    require(_vote < polls[_pollId].voteCounts.length, "colony-token-voting-invalid-vote");

    // Remove the secret
    prev.nextPollCloses = curr.nextPollCloses;
    next.prevPollCloses = curr.prevPollCloses;
    delete userVotes[msg.sender][pollCloses];

    // Increment the vote if poll in reveal
    if (getPollState(_pollId) == PollState.Reveal) {
      address token = colony.getToken();
      address tokenLocking = colonyNetwork.getTokenLocking();
      uint256 userBalance = ITokenLocking(tokenLocking).getUserLock(token, msg.sender).balance;
      polls[_pollId].voteCounts[_vote] += userBalance;
    }
  }

  function isAddressLocked(address _address) public view returns (bool) {
    uint256 nextPollCloses = userVotes[_address][0].nextPollCloses;
    if (nextPollCloses == 0) {
      // The list is empty, no unrevealed votes for this address
      return false;
    } else if (now < nextPollCloses) {
     // The poll is still open for voting and tokens transfer
      return false;
    } else {
      // The poll is closed for voting and is in the reveal period, during which all votes' tokens are locked until reveal
      // Note: even after the poll is resolved, tokens remain locked until reveal
      return true;
    }
  }

}
