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

import "../PatriciaTree/PatriciaTreeProofs.sol";
import "./VotingBase.sol";


contract VotingReputation is VotingBase, PatriciaTreeProofs {

  constructor(address _colony) public VotingBase(_colony) {}

  struct RepInfo {
    bytes32 rootHash;
    uint256 skillId;
  }

  mapping (uint256 => RepInfo) repInfo;

  // The UserVote type here is just the bytes32 voteSecret

  mapping (address => mapping (uint256 => bytes32)) userVotes;

  function createPoll(
    bytes memory _action,
    uint256 _duration,
    uint256 _skillId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    pollCount += 1;

    repInfo[pollCount].rootHash = colonyNetwork.getReputationRootHash();
    repInfo[pollCount].skillId = _skillId;

    polls[pollCount].closes = add(now, _duration);
    polls[pollCount].maxVotes = checkReputation(pollCount, address(0x0), _key, _value, _branchMask, _siblings);
    polls[pollCount].action = _action;
  }

  function submitVote(uint256 _pollId, bytes32 _voteSecret) public {
    require(getPollState(_pollId) == PollState.Open, "voting-rep-poll-not-open");
    userVotes[msg.sender][_pollId] = _voteSecret;
  }

  function revealVote(
    uint256 _pollId,
    bytes32 _salt,
    bool _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    require(getPollState(_pollId) != PollState.Open, "voting-rep-poll-still-open");

    bytes32 voteSecret = userVotes[msg.sender][_pollId];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");

    // Validate proof and get reputation value
    uint256 userReputation = checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    // Remove the secret
    delete userVotes[msg.sender][_pollId];

    // Increment the vote if poll in reveal, otherwise skip
    // NOTE: since there's no locking, we could just `require` PollState.Reveal
    if (getPollState(_pollId) == PollState.Reveal) {
      polls[_pollId].votes[_vote ? 1 : 0] += userReputation;
    }
  }

  function checkReputation(
    uint256 _pollId,
    address _who,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal view returns (uint256)
  {
    bytes32 impliedRoot = getImpliedRootHashKey(_key, _value, _branchMask, _siblings);
    require(repInfo[_pollId].rootHash == impliedRoot, "voting-rep-invalid-root-hash");

    uint256 reputationValue;
    address keyColonyAddress;
    uint256 keySkill;
    address keyUserAddress;

    assembly {
      reputationValue := mload(add(_value, 32))
      keyColonyAddress := mload(add(_key, 20))
      keySkill := mload(add(_key, 52))
      keyUserAddress := mload(add(_key, 72))
    }

    require(keyColonyAddress == address(colony), "voting-rep-invalid-colony-address");
    require(keySkill == repInfo[_pollId].skillId, "voting-rep-invalid-skill-id");
    require(keyUserAddress == _who, "voting-rep-invalid-user-address");

    return reputationValue;
  }

}
