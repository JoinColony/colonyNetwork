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

import "../IColony.sol";
import "../IColonyNetwork.sol";
import "../PatriciaTree/PatriciaTreeProofs.sol";
import "../../lib/dappsys/math.sol";


contract VotingReputation is DSMath, PatriciaTreeProofs {

  // Constants
  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant STAKE_INVERSE = 1000;
  uint256 constant VOTE_PERIOD = 2 days;
  uint256 constant REVEAL_PERIOD = 2 days;
  bytes4 constant CHANGE_FUNC = bytes4(keccak256("setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)"));

  // Initialization data
  IColony colony;
  IColonyNetwork colonyNetwork;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
  }

  // Data structures
  enum PollState { Open, Reveal, Closed, Executed }

  struct Poll {
    bool executed;
    uint256 createdAt;
    bytes32 rootHash;
    uint256 skillId;
    uint256 skillRep;
    uint256[2] stakes; // [nay, yay]
    uint256[2] votes; // [nay, yay]
    bytes action;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;
  mapping (uint256 => mapping (address => mapping (bool => uint256))) stakers;

  // The UserVote type here is just the bytes32 voteSecret
  mapping (address => mapping (uint256 => bytes32)) userVotes;

  mapping (bytes32 => uint256) pastVotes;

  // Public functions (interface)

  function createRootPoll(
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    uint256 rootSkillId = colony.getDomain(1).skillId;
    createPoll(_action, rootSkillId, _key, _value, _branchMask, _siblings);
  }

  function createDomainPoll(
    uint256 _domainId,
    uint256 _childSkillIndex,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    uint256 domainSkillId = colony.getDomain(_domainId).skillId;
    uint256 actionDomainSkillId = getActionDomainSkillId(_action);

    if (domainSkillId != actionDomainSkillId) {
      uint256 childSkillId = colonyNetwork.getChildSkillId(domainSkillId, _childSkillIndex);
      require(childSkillId == actionDomainSkillId, "voting-rep-invalid-domain-id");
    }

    createPoll(_action, domainSkillId, _key, _value, _branchMask, _siblings);
  }

  function stakePoll(uint256 _pollId, uint256 _domainId, bool _vote, uint256 _amount) public {
    Poll storage poll = polls[_pollId];

    // TODO: can we keep the domainId on the poll somewhere? This seems like a wasteful external call.
    //   But if it's 10 external calls per word of storage, then < 10 stakers makes this cheaper.
    require(colony.getDomain(_domainId).skillId == poll.skillId, "voting-rep-bad-stake-domain");
    require(stakers[_pollId][msg.sender][!_vote] == 0, "voting-rep-cannot-stake-both-sides");

    // TODO: come up with something better than `bool2vote`. Maybe an enum?
    uint256 currentStake = poll.stakes[bool2vote(_vote)];
    uint256 requiredStake = poll.skillRep / STAKE_INVERSE;

    require(add(currentStake, _amount) <= requiredStake, "voting-rep-stake-too-large");

    poll.stakes[bool2vote(_vote)] = add(poll.stakes[bool2vote(_vote)], _amount);
    stakers[_pollId][msg.sender][_vote] = add(stakers[_pollId][msg.sender][_vote], _amount);

    // TODO: add implementation!
    // colony.obligateStake(msg.sender, _domainId, _amount);
  }

  function executePoll(uint256 _pollId) public returns (bool) {
    require(getPollState(_pollId) != PollState.Executed, "voting-base-poll-already-executed");
    require(getPollState(_pollId) == PollState.Closed, "voting-base-poll-not-closed");

    Poll storage poll = polls[_pollId];
    poll.executed = true;

    if (getSig(poll.action) == CHANGE_FUNC) {
      bytes32 slot = encodeSlot(poll.action);
      uint256 votePower = add(poll.votes[0], poll.votes[1]);

      require(pastVotes[slot] < votePower, "voting-rep-insufficient-vote-power");

      pastVotes[slot] = votePower;
    }

    if (poll.votes[0] < poll.votes[1]) {
      return executeCall(address(colony), poll.action);
    }
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
      polls[_pollId].votes[bool2vote(_vote)] += userReputation;
    }
  }

  // Public view functions

  function getPollCount() public view returns (uint256) {
    return pollCount;
  }

  function getPoll(uint256 _pollId) public view returns (Poll memory poll) {
    poll = polls[_pollId];
  }

  function getStake(uint256 _pollId, address _staker, bool _vote) public view returns (uint256) {
    return stakers[_pollId][_staker][_vote];
  }

  function getPollState(uint256 _pollId) public view returns (PollState) {
    Poll storage poll = polls[_pollId];
    if (now < poll.createdAt + VOTE_PERIOD) {
      return PollState.Open;
    } else if (now < poll.createdAt + VOTE_PERIOD + REVEAL_PERIOD) {
      return PollState.Reveal;
    } else if (!poll.executed) {
      return PollState.Closed;
    } else {
      return PollState.Executed;
    }
  }

  // Internal functions

  function createPoll(
    bytes memory _action,
    uint256 _skillId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal
  {
    pollCount += 1;

    polls[pollCount].rootHash = colonyNetwork.getReputationRootHash();
    polls[pollCount].skillId = _skillId;

    polls[pollCount].createdAt = now;
    polls[pollCount].skillRep = checkReputation(pollCount, address(0x0), _key, _value, _branchMask, _siblings);
    polls[pollCount].action = _action;
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
    require(polls[_pollId].rootHash == impliedRoot, "voting-rep-invalid-root-hash");

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
    require(keySkill == polls[_pollId].skillId, "voting-rep-invalid-skill-id");
    require(keyUserAddress == _who, "voting-rep-invalid-user-address");

    return reputationValue;
  }

  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = colony.getDomain(permissionDomainId).skillId;

    if (childSkillIndex == UINT256_MAX) {
      return permissionSkillId;
    } else {
      return colonyNetwork.getChildSkillId(permissionSkillId, childSkillIndex);
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

  function getVoteSecret(bytes32 _salt, bool _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function bool2vote(bool _vote) internal pure returns (uint256) {
    return _vote ? 1 : 0;
  }

  function getSig(bytes memory action) internal returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }

  function encodeSlot(bytes memory action) internal returns (bytes32 slot) {
    assembly {
      // Hash all but last (value) byte, since mload(action) gives length+32
      slot := keccak256(action, mload(action))
    }
  }
}
