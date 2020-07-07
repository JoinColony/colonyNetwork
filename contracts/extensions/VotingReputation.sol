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

import "./../../lib/dappsys/math.sol";
import "./../colony/ColonyDataTypes.sol";
import "./../colony/IColony.sol";
import "./../colonyNetwork/IColonyNetwork.sol";
import "./../common/ERC20Extended.sol";
import "./../patriciaTree/PatriciaTreeProofs.sol";
import "./../tokenLocking/ITokenLocking.sol";


contract VotingReputation is DSMath, PatriciaTreeProofs {

  // Events
  event ExtensionInitialised();
  event ExtensionDeprecated();
  event PollCreated(uint256 indexed pollId, uint256 indexed skillId);
  event PollStaked(uint256 indexed pollId, address indexed staker, uint256 indexed vote, uint256 amount);
  event PollVoteSubmitted(uint256 indexed pollId, address indexed voter);
  event PollVoteRevealed(uint256 indexed pollId, address indexed voter, uint256 indexed vote);
  event PollExecuted(uint256 indexed pollId, bytes action, bool success);
  event PollRewardClaimed(uint256 indexed pollId, address indexed staker, uint256 indexed vote, uint256 amount);

  // Constants
  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  uint256 constant CREATE = 0;
  uint256 constant STAKE_END = 1;
  uint256 constant SUBMIT_END = 2;
  uint256 constant REVEAL_END = 3;

  bytes4 constant CHANGE_FUNCTION = bytes4(
    keccak256("setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)")
  );

  enum ExtensionState { Deployed, Active, Deprecated }

  // Initialization data
  ExtensionState state;

  IColony colony;
  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  uint256 stakeFraction; // Percent of domain reputation needed for staking
  uint256 minStakeFraction; // Minimum stake as percent of required stake (100% means single-staker)

  uint256 maxVoteFraction; // The percent of total domain rep we need before closing the vote
  uint256 voterRewardFraction; // Percent of stake paid out to voters as rewards (immediately taken from the stake)
  uint256 votePowerFraction; // Percent of domain rep used as vote power if no-contest

  uint256 stakePeriod; // Length of time for staking
  uint256 submitPeriod; // Length of time for submitting votes
  uint256 revealPeriod; // Length of time for revealing votes

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
  }

  function initialise(
    uint256 _stakeFraction,
    uint256 _minStakeFraction,
    uint256 _maxVoteFraction,
    uint256 _voterRewardFraction,
    uint256 _votePowerFraction,
    uint256 _stakePeriod,
    uint256 _submitPeriod,
    uint256 _revealPeriod
  )
    public
  {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-user-not-root");
    require(state == ExtensionState.Deployed, "voting-rep-already-initialised");

    require(_stakeFraction <= WAD, "voting-rep-must-be-wad");
    require(_minStakeFraction <= WAD, "voting-rep-must-be-wad");

    require(_maxVoteFraction <= WAD, "voting-rep-must-be-wad");
    require(_voterRewardFraction <= WAD, "voting-rep-must-be-wad");
    require(_votePowerFraction <= WAD, "voting-rep-must-be-wad");

    require(_stakePeriod <= 365 days, "voting-rep-period-too-long");
    require(_submitPeriod <= 365 days, "voting-rep-period-too-long");
    require(_revealPeriod <= 365 days, "voting-rep-period-too-long");

    state = ExtensionState.Active;

    stakeFraction = _stakeFraction;
    minStakeFraction = _minStakeFraction;

    maxVoteFraction = _maxVoteFraction;
    voterRewardFraction = _voterRewardFraction;
    votePowerFraction = _votePowerFraction;

    stakePeriod = _stakePeriod;
    submitPeriod = _submitPeriod;
    revealPeriod = _revealPeriod;

    emit ExtensionInitialised();
  }

  function deprecate() public {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-user-not-root");

    state = ExtensionState.Deprecated;

    emit ExtensionDeprecated();
  }

  // Data structures
  enum PollState { Staking, Submit, Reveal, Closed, Executable, Executed, Failed }
  enum Response { None, Fold, Call }

  struct Poll {
    uint256[4] events; // Creation, Staking, Submission, Revelation
    bytes32 rootHash;
    uint256 domainId;
    uint256 skillId;
    uint256 skillRep;
    uint256 repSubmitted;
    uint256 repRevealed;
    uint256 unpaidRewards;
    uint256[2] stakes; // [nay, yay]
    uint256[2] votes; // [nay, yay]
    address[2] leads; // [nay, yay]
    Response[2] responses; // [nay, yay]
    bool executed;
    address target;
    bytes action;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;

  mapping (address => mapping (uint256 => bytes32)) voteSecrets;

  mapping (bytes32 => uint256) pastPolls; // action signature => voting power
  mapping (bytes32 => uint256) activePolls; // action signature => pollId
  mapping (bytes32 => uint256) expenditurePollCounts; // expenditure signature => count

  // Public functions (interface)

  function createRootPoll(
    address _target,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    uint256 rootSkillId = colony.getDomain(1).skillId;
    createPoll(_target, _action, 1, rootSkillId, _key, _value, _branchMask, _siblings);
  }

  function createDomainPoll(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _target,
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

    createPoll(_target, _action, _domainId, domainSkillId, _key, _value, _branchMask, _siblings);
  }

  function stakePoll(
    uint256 _pollId,
    uint256 _permissionDomainId, // For extension's arbitration permission
    uint256 _childSkillIndex, // For extension's arbitration permission
    uint256 _vote,
    uint256 _amount,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(_vote <= 1, "voting-rep-bad-vote");
    require(getPollState(_pollId) == PollState.Staking, "voting-rep-staking-closed");

    require(
      activePolls[hashAction(poll.action)] == 0 ||
      activePolls[hashAction(poll.action)] == _pollId,
      "voting-rep-competing-poll-exists"
    );

    uint256 requiredStake = getRequiredStake(_pollId);
    uint256 amount = min(_amount, sub(requiredStake, poll.stakes[_vote]));
    uint256 stakerTotalAmount = add(stakes[_pollId][msg.sender][_vote], amount);

    require(
      stakerTotalAmount <= checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings),
      "voting-rep-insufficient-rep"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, minStakeFraction),
      "voting-rep-insufficient-stake"
    );

    colony.obligateStake(msg.sender, poll.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msg.sender, poll.domainId, amount, address(this));

    // Update the stake
    poll.unpaidRewards = add(poll.unpaidRewards, amount);
    poll.stakes[_vote] = add(poll.stakes[_vote], amount);
    stakes[_pollId][msg.sender][_vote] = stakerTotalAmount;

    // Update the lead if the stake is larger
    if (stakes[_pollId][poll.leads[_vote]][_vote] < amount) {
      poll.leads[_vote] = msg.sender;
    }

    // Activate poll to prevent competing polls from being activated
    if (poll.stakes[YAY] == requiredStake && _vote == YAY) {
      activePolls[hashAction(poll.action)] = _pollId;

      // Increment counter & extend claim delay if staking for an expenditure state change
      if (getSig(poll.action) == CHANGE_FUNCTION) {
        bytes32 expenditureHash = hashExpenditureAction(poll.action);
        expenditurePollCounts[expenditureHash] = add(expenditurePollCounts[expenditureHash], 1);

        bytes memory claimDelayAction = createClaimDelayAction(poll.action, UINT256_MAX);
        executeCall(_pollId, claimDelayAction);
      }
    }

    // Claim tokens if fully staked
    if (poll.stakes[YAY] == requiredStake && poll.stakes[NAY] == requiredStake) {
      tokenLocking.claim(token, true);
    }

    emit PollStaked(_pollId, msg.sender, _vote, amount);
  }

  function respondToStake(uint256 _pollId, uint256 _vote, Response _response) public {
    Poll storage poll = polls[_pollId];
    uint256 requiredStake = getRequiredStake(_pollId);

    require(poll.stakes[YAY] == requiredStake && poll.stakes[NAY] == requiredStake, "voting-rep-not-fully-staked");
    require(getPollState(_pollId) == PollState.Staking, "voting-rep-not-staking");
    require(poll.leads[_vote] == msg.sender, "voting-rep-not-lead");
    require(poll.responses[_vote] == Response.None, "voting-rep-already-responded");

    poll.responses[_vote] = _response;

    if (poll.responses[YAY] != Response.None && poll.responses[NAY] != Response.None) {
      poll.events[STAKE_END] = now;
    }
  }

  function submitVote(
    uint256 _pollId,
    bytes32 _voteSecret,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) == PollState.Submit, "voting-rep-poll-not-open");

    uint256 userRep = checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    voteSecrets[msg.sender][_pollId] = _voteSecret;
    poll.repSubmitted = add(poll.repSubmitted, userRep);

    if (poll.repSubmitted >= wmul(poll.skillRep, maxVoteFraction)) {
      poll.events[SUBMIT_END] = now;
    }

    emit PollVoteSubmitted(_pollId, msg.sender);
  }

  function revealVote(
    uint256 _pollId,
    bytes32 _salt,
    uint256 _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) == PollState.Reveal, "voting-rep-poll-not-reveal");

    uint256 userRep = checkReputation(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    bytes32 voteSecret = voteSecrets[msg.sender][_pollId];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");
    delete voteSecrets[msg.sender][_pollId];

    poll.votes[_vote] = add(poll.votes[_vote], userRep);
    poll.repRevealed = add(poll.repRevealed, userRep);

    if (poll.repRevealed >= wmul(poll.skillRep, maxVoteFraction)) {
      poll.events[REVEAL_END] = now;
    }

    uint256 pctReputation = wdiv(userRep, poll.skillRep);
    uint256 totalStake = add(poll.stakes[YAY], poll.stakes[NAY]);
    uint256 voterReward = wmul(wmul(pctReputation, totalStake), voterRewardFraction);

    poll.unpaidRewards = sub(poll.unpaidRewards, voterReward);
    tokenLocking.transfer(token, voterReward, msg.sender, true);

    emit PollVoteRevealed(_pollId, msg.sender, _vote);
  }

  function escalatePoll(
    uint256 _pollId,
    uint256 _newDomainId,
    uint256 _childSkillIndex,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) == PollState.Closed, "voting-rep-poll-not-closed");

    uint256 newDomainSkillId = colony.getDomain(_newDomainId).skillId;
    uint256 childSkillId = colonyNetwork.getChildSkillId(newDomainSkillId, _childSkillIndex);
    require(childSkillId == poll.skillId, "voting-rep-invalid-domain-proof");

    delete poll.events;
    delete poll.responses;

    poll.events[CREATE] = now;
    poll.domainId = _newDomainId;
    poll.skillId = newDomainSkillId;
    poll.skillRep = checkReputation(_pollId, address(0x0), _key, _value, _branchMask, _siblings);
  }

  function executePoll(uint256 _pollId) public {
    Poll storage poll = polls[_pollId];
    PollState pollState = getPollState(_pollId);
    bytes32 actionHash = hashAction(poll.action);

    require(pollState != PollState.Failed, "voting-rep-poll-failed");
    require(pollState != PollState.Closed, "voting-rep-poll-escalation-window-open");
    require(pollState != PollState.Executed, "voting-rep-poll-already-executed");
    require(pollState == PollState.Executable, "voting-rep-poll-not-executable");

    poll.executed = true;
    delete activePolls[actionHash];

    bool canExecute = (
      poll.stakes[NAY] <= poll.stakes[YAY] &&
      poll.votes[NAY] <= poll.votes[YAY]
    );

    if (getSig(poll.action) == CHANGE_FUNCTION) {
      bytes32 expenditureHash = hashExpenditureAction(poll.action);
      expenditurePollCounts[expenditureHash] = sub(expenditurePollCounts[expenditureHash], 1);

      // Release the claimDelay if this is the last active poll
      if (expenditurePollCounts[expenditureHash] == 0) {
        bytes memory claimDelayAction = createClaimDelayAction(poll.action, 0);
        executeCall(_pollId, claimDelayAction);
      }

      // Conditions:
      //  - Yay side staked and nay side did not, and doman has sufficient vote power
      //  - Both sides staked and yay side won, with sufficient vote power

      uint256 votePower;
      if (poll.stakes[NAY] < getRequiredStake(_pollId)) {
        votePower = wmul(poll.skillRep, votePowerFraction);
      } else {
        votePower = poll.votes[YAY];
      }

      if (pastPolls[actionHash] < votePower) {
        pastPolls[actionHash] = votePower;
        canExecute = canExecute && true;
      } else {
        canExecute = canExecute && false;
      }
    }

    bool success;
    if (canExecute) {
      success = executeCall(_pollId, poll.action);
    }

    emit PollExecuted(_pollId, poll.action, success);
  }

  function claimReward(
    uint256 _pollId,
    uint256 _permissionDomainId, // For extension's arbitration permission
    uint256 _childSkillIndex, // For extension's arbitration permission
    address _user,
    uint256 _vote
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(
      getPollState(_pollId) == PollState.Executed ||
      getPollState(_pollId) == PollState.Failed,
      "voting-rep-not-failed-or-executed"
    );

    // Calculate how much of the stake is left after voter compensation (>= 90%)
    uint256 stake = stakes[_pollId][_user][_vote];
    uint256 totalStake = add(poll.stakes[NAY], poll.stakes[YAY]);
    uint256 rewardFraction = wdiv(poll.unpaidRewards, totalStake);
    uint256 rewardStake = wmul(stake, rewardFraction);

    delete stakes[_pollId][_user][_vote];

    uint256 stakerReward;
    uint256 repPenalty;

    // Went to a vote, use vote to determine reward or penalty
    if (
      poll.stakes[NAY] == getRequiredStake(_pollId) &&
      poll.stakes[YAY] == getRequiredStake(_pollId)
    ) {
      uint256 stakerVotes = poll.votes[_vote];
      uint256 totalVotes = add(poll.votes[NAY], poll.votes[YAY]);
      uint256 winPercent = wdiv(stakerVotes, totalVotes);
      uint256 winShare = wmul(winPercent, 2 * WAD);
      stakerReward = wmul(rewardStake, winShare);
      repPenalty = (winShare < WAD) ? sub(stake, wmul(winShare, stake)) : 0;

    // Your side fully staked, receive 10% (proportional) of loser's stake
    } else if (poll.stakes[_vote] == getRequiredStake(_pollId)) {
      uint256 stakePercent = wdiv(stake, poll.stakes[_vote]);
      uint256 totalPenalty = wmul(poll.stakes[flip(_vote)], WAD / 10);
      stakerReward = add(rewardStake, wmul(stakePercent, totalPenalty));

    // Opponent's side fully staked, pay 10% penalty
    } else if (poll.stakes[flip(_vote)] == getRequiredStake(_pollId)) {
      stakerReward = wmul(rewardStake, (WAD / 10) * 9);
      repPenalty = stake / 10;

    // Neither side fully staked, no reward or penalty
    } else {
      stakerReward = rewardStake;
    }

    tokenLocking.transfer(token, stakerReward, _user, true);

    if (repPenalty > 0) {
      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        poll.domainId,
        _user,
        -int256(repPenalty)
      );
    }

    emit PollRewardClaimed(_pollId, _user, _vote, stakerReward);
  }

  // Public view functions

  function getPollCount() public view returns (uint256) {
    return pollCount;
  }

  function getPoll(uint256 _pollId) public view returns (Poll memory poll) {
    poll = polls[_pollId];
  }

  function getActivePoll(bytes32 _actionHash) public view returns (uint256) {
    return activePolls[_actionHash];
  }

  function getExpenditurePollCount(bytes32 _expenditureHash) public view returns (uint256) {
    return expenditurePollCounts[_expenditureHash];
  }

  function getStake(uint256 _pollId, address _staker, uint256 _vote) public view returns (uint256) {
    return stakes[_pollId][_staker][_vote];
  }

  function getPastPoll(bytes32 _slot) public view returns (uint256) {
    return pastPolls[_slot];
  }

  function getPollState(uint256 _pollId) public view returns (PollState) {
    Poll storage poll = polls[_pollId];
    uint256 requiredStake = getRequiredStake(_pollId);

    // If executed, we're done
    if (poll.executed) {
      return PollState.Executed;

    // Not fully staked
    } else if (
      poll.stakes[YAY] < requiredStake ||
      poll.stakes[NAY] < requiredStake
    ) {
      // Are we still staking?
      if (now < poll.events[CREATE] + stakePeriod && poll.events[STAKE_END] == 0) {
        return PollState.Staking;
      // If not, did the YAY side stake?
      } else if (poll.stakes[YAY] == requiredStake) {
        return PollState.Executable;
      // If not, was there a prior vote we can fall back on?
      } else if (poll.votes[NAY] > 0 || poll.votes[YAY] > 0) {
        return PollState.Executable;
      // Otherwise, the poll failed
      } else {
        return PollState.Failed;
      }

    // Fully staked, check for any folds
    } else if (poll.responses[YAY] == Response.Fold) {
      return PollState.Failed;
    } else if (poll.responses[NAY] == Response.Fold) {
      return PollState.Executable;

    // Do we need to keep waiting?
    } else if (now < poll.events[CREATE] + stakePeriod && poll.events[STAKE_END] == 0) {
      return PollState.Staking;

    // Fully staked, no folds, go to a vote
    } else {

      if (now < min(
        poll.events[CREATE] + stakePeriod + submitPeriod,
        min(
          selfOrMax(poll.events[STAKE_END]) + submitPeriod,
          selfOrMax(poll.events[SUBMIT_END])
        )
      )) {
        return PollState.Submit;
      } else if (now < min(
        poll.events[CREATE] + stakePeriod + submitPeriod + revealPeriod,
        min(
          selfOrMax(poll.events[STAKE_END]) + submitPeriod + revealPeriod,
          min(
            selfOrMax(poll.events[SUBMIT_END]) + revealPeriod,
            selfOrMax(poll.events[REVEAL_END])
          )
        )
      )) {
        return PollState.Reveal;
      } else if (now < min(
        poll.events[CREATE] + stakePeriod + submitPeriod + revealPeriod + stakePeriod,
        min(
          selfOrMax(poll.events[STAKE_END]) + submitPeriod + revealPeriod + stakePeriod,
          min(
            selfOrMax(poll.events[SUBMIT_END]) + revealPeriod + stakePeriod,
            selfOrMax(poll.events[REVEAL_END]) + stakePeriod
          )
        )
      )) {
        return PollState.Closed;
      } else {
        return PollState.Executable;
      }

    }
  }

  // Internal functions

  function createPoll(
    address _target,
    bytes memory _action,
    uint256 _domainId,
    uint256 _skillId,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    internal
  {
    require(state == ExtensionState.Active, "voting-rep-not-active");

    pollCount += 1;
    polls[pollCount].events[CREATE] = now;
    polls[pollCount].rootHash = colonyNetwork.getReputationRootHash();
    polls[pollCount].domainId = _domainId;
    polls[pollCount].skillId = _skillId;
    polls[pollCount].skillRep = checkReputation(pollCount, address(0x0), _key, _value, _branchMask, _siblings);
    polls[pollCount].target = _target;
    polls[pollCount].action = _action;

    emit PollCreated(pollCount, _skillId);
  }

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function getRequiredStake(uint256 _pollId) internal view returns (uint256) {
    return wmul(polls[_pollId].skillRep, stakeFraction);
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return 1 - _vote;
  }

  function selfOrMax(uint256 _timestamp) internal pure returns (uint256) {
    return (_timestamp == 0) ? UINT128_MAX : _timestamp;
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

  function executeCall(uint256 pollId, bytes memory action) internal returns (bool success) {
    address target = polls[pollId].target;
    address to = (target == address(0x0)) ? address(colony) : target;

    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,   a,  v, in,                insize,        out, outsize)
      success := call(gas, to, 0, add(action, 0x20), mload(action), 0, 0)
    }

    return success;
  }

  function getSig(bytes memory action) internal returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }

  function hashAction(bytes memory action) internal returns (bytes32 hash) {
    if (getSig(action) == CHANGE_FUNCTION) {
      assembly {
        // Hash all but last (value) bytes32
        //  Recall: mload(action) gives length of bytes array
        //  So skip past the first bytes32 (length), and the last bytes32 (value)
        hash := keccak256(add(action, 0x20), sub(mload(action), 0x20))
      }
    } else {
      assembly {
        // Hash entire action
        //  Recall: mload(action) gives length of bytes array
        //  So skip past the first bytes32 (length)
        hash := keccak256(add(action, 0x20), mload(action))
      }
    }
  }

  function hashExpenditureAction(bytes memory action) internal returns (bytes32 hash) {
    assert(getSig(action) == CHANGE_FUNCTION);

    uint256 expenditureId;
    uint256 storageSlot;
    uint256 expenditureSlot;

    assembly {
      expenditureId := mload(add(action, 0x64))
      storageSlot := mload(add(action, 0x84))
      expenditureSlot := mload(add(action, 0x184))
    }

    if (storageSlot == 25) {
      hash = keccak256(abi.encodePacked(expenditureId));
    } else {
      hash = keccak256(abi.encodePacked(expenditureId, expenditureSlot));
    }
  }

  function createClaimDelayAction(bytes memory action, uint256 value)
    public
    returns (bytes memory)
  {
    // See https://solidity.readthedocs.io/en/develop/abi-spec.html#use-of-dynamic-types
    //  for documentation on how the action `bytes` is encoded

    bytes32 functionSignature;
    uint256 permissionDomainId;
    uint256 childSkillIndex;
    uint256 expenditureId;
    uint256 storageSlot;

    assembly {
      functionSignature := mload(add(action, 0x20))
      permissionDomainId := mload(add(action, 0x24))
      childSkillIndex := mload(add(action, 0x44))
      expenditureId := mload(add(action, 0x64))
      storageSlot := mload(add(action, 0x84))
    }

    // If we are editing the main expenditure struct
    if (storageSlot == 25) {

      bytes memory claimDelayAction = new bytes(4 + 32 * 11); // 356 bytes
      assembly {
          mstore(add(claimDelayAction, 0x20), functionSignature)
          mstore(add(claimDelayAction, 0x24), permissionDomainId)
          mstore(add(claimDelayAction, 0x44), childSkillIndex)
          mstore(add(claimDelayAction, 0x64), expenditureId)
          mstore(add(claimDelayAction, 0x84), 25)     // expenditure storage slot
          mstore(add(claimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(claimDelayAction, 0xc4), 0x120)  // keys location
          mstore(add(claimDelayAction, 0xe4), value)
          mstore(add(claimDelayAction, 0x104), 1)     // mask length
          mstore(add(claimDelayAction, 0x124), 1)     // offset
          mstore(add(claimDelayAction, 0x144), 1)     // keys length
          mstore(add(claimDelayAction, 0x164), 4)     // globalClaimDelay offset
      }
      return claimDelayAction;

    // If we are editing an expenditure slot
    } else {

      bytes memory claimDelayAction = new bytes(4 + 32 * 13); // 420 bytes
      uint256 expenditureSlot;

      assembly {
          expenditureSlot := mload(add(action, 0x184))

          mstore(add(claimDelayAction, 0x20), functionSignature)
          mstore(add(claimDelayAction, 0x24), permissionDomainId)
          mstore(add(claimDelayAction, 0x44), childSkillIndex)
          mstore(add(claimDelayAction, 0x64), expenditureId)
          mstore(add(claimDelayAction, 0x84), 26)     // expenditureSlot storage slot
          mstore(add(claimDelayAction, 0xa4), 0xe0)   // mask location
          mstore(add(claimDelayAction, 0xc4), 0x140)  // keys location
          mstore(add(claimDelayAction, 0xe4), value)
          mstore(add(claimDelayAction, 0x104), 2)     // mask length
          mstore(add(claimDelayAction, 0x124), 0)     // mapping
          mstore(add(claimDelayAction, 0x144), 1)     // offset
          mstore(add(claimDelayAction, 0x164), 2)     // keys length
          mstore(add(claimDelayAction, 0x184), expenditureSlot)
          mstore(add(claimDelayAction, 0x1a4), 1)     // claimDelay offset
      }
      return claimDelayAction;

    }
  }
}
