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

import "../ERC20Extended.sol";
import "../IColony.sol";
import "../IColonyNetwork.sol";
import "../ITokenLocking.sol";
import "../PatriciaTree/PatriciaTreeProofs.sol";
import "../../lib/dappsys/math.sol";


contract VotingReputation is DSMath, PatriciaTreeProofs {

  // Events
  event PollCreated(uint256 indexed pollId, uint256 indexed skillId);
  event PollStaked(uint256 indexed pollId, address indexed staker, bool indexed side, uint256 amount);
  event PollVoteSubmitted(uint256 indexed pollId, address indexed voter);
  event PollVoteRevealed(uint256 indexed pollId, address indexed voter, bool indexed side);
  event PollExecuted(uint256 indexed pollId);
  event PollRewardClaimed(uint256 indexed pollId, address indexed staker, bool indexed side, uint256 amount);
  event PollColonyRewardClaimed(uint256 indexed pollId, uint256 amount);

  // Constants
  uint256 constant NAY = 0;
  uint256 constant YAY = 1;
  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant STAKE_PCT = WAD / 1000; // 0.1%
  uint256 constant VOTER_REWARD_PCT = WAD / 10; // 10%
  uint256 constant STAKER_REWARD_PCT = WAD - VOTER_REWARD_PCT; // 90%
  uint256 constant STAKE_PERIOD = 3 days;
  uint256 constant VOTE_PERIOD = 2 days;
  uint256 constant REVEAL_PERIOD = 2 days;
  bytes4 constant CHANGE_FUNC = bytes4(
    keccak256("setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)")
  );

  // Initialization data
  IColony colony;
  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
  }

  // Data structures
  enum PollState { StakeYay, StakeNay, Open, Reveal, Closed, Executed, Failed }

  struct Poll {
    uint256 lastEvent; // Set at creation and when fully staked yay and nay
    uint256 skillId;
    bytes32 rootHash;
    uint256 skillRep;
    uint256 voterComp;
    uint256[2] stakes; // [nay, yay]
    uint256[2] votes; // [nay, yay]
    bytes action;
    bool executed;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;
  mapping (uint256 => mapping (address => mapping (bool => uint256))) stakers;

  mapping (address => mapping (uint256 => bytes32)) voteSecrets;

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

  function stakePoll(
    uint256 _pollId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    bool _vote,
    uint256 _amount,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    PollState pollState = getPollState(_pollId);
    uint256 stakerRep = checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    // TODO: can we keep the domainId on the poll somewhere? This seems like a wasteful external call.
    //   But if it's 10 external calls per word of storage, then < 10 stakers makes this cheaper.
    require(colony.getDomain(_domainId).skillId == polls[_pollId].skillId, "voting-rep-bad-stake-domain");
    require(add(stakers[_pollId][msg.sender][_vote], _amount) <= stakerRep, "voting-rep-insufficient-rep");

    require(add(polls[_pollId].stakes[toInt(_vote)], _amount) <= getRequiredStake(_pollId), "voting-rep-stake-too-large");
    require(pollState == PollState.StakeYay || pollState == PollState.StakeNay, "voting-rep-staking-closed");
    require(_vote || pollState == PollState.StakeNay, "voting-rep-out-of-order");

    colony.obligateStake(msg.sender, _domainId, _amount);
    colony.slashStake(_permissionDomainId, _childSkillIndex, address(this), msg.sender, _domainId, _amount, address(this));

    polls[_pollId].stakes[toInt(_vote)] = add(polls[_pollId].stakes[toInt(_vote)], _amount);
    stakers[_pollId][msg.sender][_vote] = add(stakers[_pollId][msg.sender][_vote], _amount);

    // Update timestamp if fully staked
    if (polls[_pollId].stakes[YAY] == getRequiredStake(_pollId) || polls[_pollId].stakes[NAY] == getRequiredStake(_pollId)) {
      polls[_pollId].lastEvent = now;
    }

    // If all stakes are in, claim the pending tokens
    if (polls[_pollId].stakes[NAY] == getRequiredStake(_pollId)) {
      tokenLocking.claim(token, true);
    }

    emit PollStaked(_pollId, msg.sender, _vote, _amount);
  }

  function submitVote(uint256 _pollId, bytes32 _voteSecret) public {
    require(getPollState(_pollId) == PollState.Open, "voting-rep-poll-not-open");
    voteSecrets[msg.sender][_pollId] = _voteSecret;

    emit PollVoteSubmitted(_pollId, msg.sender);
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
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) != PollState.Open, "voting-rep-poll-still-open");

    bytes32 voteSecret = voteSecrets[msg.sender][_pollId];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");

    // Validate proof and get reputation value
    uint256 userReputation = checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    // Remove the secret
    delete voteSecrets[msg.sender][_pollId];

    // Increment the vote if poll in reveal, otherwise skip
    // NOTE: since there's no locking, we could just `require` PollState.Reveal
    if (getPollState(_pollId) == PollState.Reveal) {
      poll.votes[toInt(_vote)] += userReputation;
    }

    uint256 pctReputation = wdiv(userReputation, poll.skillRep);
    uint256 totalStake = add(poll.stakes[YAY], poll.stakes[NAY]);
    uint256 voterReward = wmul(wmul(pctReputation, totalStake), VOTER_REWARD_PCT);

    poll.voterComp = sub(poll.voterComp, voterReward);
    tokenLocking.transfer(token, voterReward, msg.sender, true);

    emit PollVoteRevealed(_pollId, msg.sender, _vote);
  }

  function executePoll(uint256 _pollId) public returns (bool) {
    require(getPollState(_pollId) != PollState.Failed, "voting-rep-poll-failed");
    require(getPollState(_pollId) != PollState.Executed, "voting-rep-poll-already-executed");
    require(getPollState(_pollId) == PollState.Closed, "voting-rep-poll-not-closed");

    Poll storage poll = polls[_pollId];
    poll.executed = true;

    if (getSig(poll.action) == CHANGE_FUNC) {
      bytes32 slot = encodeSlot(poll.action);
      uint256 votePower = add(poll.votes[0], poll.votes[1]);
      require(pastVotes[slot] < votePower, "voting-rep-insufficient-vote-power");

      pastVotes[slot] = votePower;
    }

    if (poll.stakes[NAY] < poll.stakes[YAY] || poll.votes[NAY] < poll.votes[YAY]) {
      return executeCall(address(colony), poll.action);
    }

    emit PollExecuted(_pollId);
  }

  function claimReward(uint256 _pollId, bool _vote) public {
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) == PollState.Executed, "voting-rep-not-executed");

    // stakerReward = (voterStake * .9) * (winPercent * 2)
    uint256 stakerVotes = poll.votes[toInt(_vote)];
    uint256 totalVotes = add(poll.votes[NAY], poll.votes[YAY]);
    uint256 winPercent = wdiv(stakerVotes, totalVotes);
    uint256 winShare = wmul(winPercent, 2 * WAD);

    uint256 voterStake = stakers[_pollId][msg.sender][_vote];
    uint256 voterRewardStake = wmul(voterStake, STAKER_REWARD_PCT);
    uint256 stakerReward = wmul(voterRewardStake, winShare);

    delete stakers[_pollId][msg.sender][_vote];
    tokenLocking.transfer(token, stakerReward, msg.sender, true);

    emit PollRewardClaimed(_pollId, msg.sender,_vote, stakerReward);
  }

  function claimRewardForColony(uint256 _pollId) public {
    require(getPollState(_pollId) == PollState.Executed, "voting-rep-not-executed");

    uint256 voterComp = polls[_pollId].voterComp;
    delete polls[_pollId].voterComp;

    tokenLocking.withdraw(token, voterComp, true);
    require(ERC20Extended(token).transfer(address(colony), voterComp), "voting-rep-colony-transfer-failed");

    emit PollColonyRewardClaimed(_pollId, voterComp);
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
    uint256 requiredStake = getRequiredStake(_pollId);

    if (poll.executed) {
      return PollState.Executed;

    } else if (poll.stakes[YAY] < requiredStake) {
      if (now < poll.lastEvent + STAKE_PERIOD) {
        return PollState.StakeYay;
      } else {
        return PollState.Failed;
      }

    } else if (poll.stakes[NAY] < requiredStake) {
      if (now < poll.lastEvent + STAKE_PERIOD) {
        return PollState.StakeNay;
      } else {
        return PollState.Closed;
      }

    } else if (now < poll.lastEvent + VOTE_PERIOD) {
      return PollState.Open;

    } else if (now < poll.lastEvent + (VOTE_PERIOD + REVEAL_PERIOD)) {
      return PollState.Reveal;

    } else {
      return PollState.Closed;
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
    polls[pollCount].lastEvent = now;
    polls[pollCount].skillId = _skillId;
    polls[pollCount].rootHash = colonyNetwork.getReputationRootHash();
    polls[pollCount].skillRep = checkReputation(pollCount, address(0x0), _key, _value, _branchMask, _siblings);
    polls[pollCount].voterComp = wmul(getRequiredStake(pollCount) * 2, VOTER_REWARD_PCT);
    polls[pollCount].action = _action;

    emit PollCreated(pollCount, _skillId);
  }

  function getVoteSecret(bytes32 _salt, bool _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function toInt(bool _vote) internal pure returns (uint256) {
    return _vote ? YAY : NAY;
  }

  function getRequiredStake(uint256 _pollId) internal view returns (uint256) {
    return wmul(polls[_pollId].skillRep, STAKE_PCT);
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
