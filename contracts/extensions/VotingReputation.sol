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
  event PollCreated(uint256 indexed pollId, address creator, uint256 indexed domainId);
  event PollStaked(uint256 indexed pollId, address indexed staker, uint256 indexed vote, uint256 amount);
  event PollVoteSubmitted(uint256 indexed pollId, address indexed voter);
  event PollVoteRevealed(uint256 indexed pollId, address indexed voter, uint256 indexed vote);
  event PollFinalized(uint256 indexed pollId, bytes action, bool executed);
  event PollEscalated(uint256 indexed pollId, address escalator, uint256 indexed domainId);
  event PollRewardClaimed(uint256 indexed pollId, address indexed staker, uint256 indexed vote, uint256 amount);
  event PollEventSet(uint256 indexed pollId, uint256 eventIndex);

  // Constants
  uint256 constant UINT256_MAX = 2**256 - 1;
  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  uint256 constant STAKE_END = 0;
  uint256 constant SUBMIT_END = 1;
  uint256 constant REVEAL_END = 2;

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

  // All `Fraction` variables are stored as WADs i.e. fixed-point numbers with 18 digits after the radix. So
  // 1 WAD = 10**18, which is interpreted as 1.

  uint256 totalStakeFraction; // Fraction of the domain's reputation needed to stake on each side in order to go to a poll.
  // This can be set to a maximum of 0.5.
  uint256 voterRewardFraction; // Fraction of staked tokens paid out to voters as rewards. This will be paid from the staked
  // tokens of the losing side. This can be set to a maximum of 0.5.

  uint256 userMinStakeFraction; // Minimum stake as fraction of required stake. 1 means a single user will be required to
  // provide the whole stake on each side, which may not be possible depending on totalStakeFraction and the distribution of
  // reputation in a domain.
  uint256 maxVoteFraction; // Fraction of total domain reputation that needs to commit votes before closing to further votes.
  // Setting this to anything other than 1 will mean it is likely not all those eligible to vote will be able to do so.

  // All `Period` variables are second-denominated

  uint256 stakePeriod; // Length of time for staking
  uint256 submitPeriod; // Length of time for submitting votes
  uint256 revealPeriod; // Length of time for revealing votes
  uint256 escalationPeriod; // Length of time for escalating after a vote

  constructor(address _colony) public {
    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
  }

  /// @notice Initialise the extension
  /// @param _totalStakeFraction The fraction of the domain's reputation we need to stake
  /// @param _userMinStakeFraction The minimum per-user stake as fraction of total stake
  /// @param _maxVoteFraction The fraction of the domain's reputation which must submit for quick-end
  /// @param _voterRewardFraction The fraction of the total stake paid out to voters as rewards
  /// @param _stakePeriod The length of the staking period in seconds
  /// @param _submitPeriod The length of the submit period in seconds
  /// @param _revealPeriod The length of the reveal period in seconds
  /// @param _escalationPeriod The length of the escalation period in seconds
  function initialise(
    uint256 _totalStakeFraction,
    uint256 _voterRewardFraction,
    uint256 _userMinStakeFraction,
    uint256 _maxVoteFraction,
    uint256 _stakePeriod,
    uint256 _submitPeriod,
    uint256 _revealPeriod,
    uint256 _escalationPeriod
  )
    public
  {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-user-not-root");
    require(state == ExtensionState.Deployed, "voting-rep-already-initialised");

    require(_totalStakeFraction <= WAD / 2, "voting-rep-greater-than-half-wad");
    require(_voterRewardFraction <= WAD / 2, "voting-rep-greater-than-half-wad");

    require(_userMinStakeFraction <= WAD, "voting-rep-greater-than-wad");
    require(_maxVoteFraction <= WAD, "voting-rep-greater-than-wad");

    require(_stakePeriod <= 365 days, "voting-rep-period-too-long");
    require(_submitPeriod <= 365 days, "voting-rep-period-too-long");
    require(_revealPeriod <= 365 days, "voting-rep-period-too-long");
    require(_escalationPeriod <= 365 days, "voting-rep-period-too-long");

    state = ExtensionState.Active;

    totalStakeFraction = _totalStakeFraction;
    voterRewardFraction = _voterRewardFraction;

    userMinStakeFraction = _userMinStakeFraction;
    maxVoteFraction = _maxVoteFraction;

    stakePeriod = _stakePeriod;
    submitPeriod = _submitPeriod;
    revealPeriod = _revealPeriod;
    escalationPeriod = _escalationPeriod;

    emit ExtensionInitialised();
  }

  /// @notice Deprecate the extension, prevening new polls from being created
  function deprecate() public {
    require(colony.hasUserRole(msg.sender, 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-user-not-root");

    state = ExtensionState.Deprecated;

    emit ExtensionDeprecated();
  }

  // Data structures
  enum PollState { Staking, Submit, Reveal, Closed, Finalizable, Finalized, Failed }

  struct Poll {
    uint64[3] events; // For recording poll lifecycle timestamps (STAKE, SUBMIT, REVEAL)
    bytes32 rootHash;
    uint256 domainId;
    uint256 skillId;
    uint256 skillRep;
    uint256 repSubmitted;
    uint256 repRevealed;
    uint256 paidVoterComp;
    uint256[2] stakes; // [nay, yay]
    uint256[2] votes; // [nay, yay]
    bool finalized;
    address target;
    bytes action;
  }

  // Storage
  uint256 pollCount;
  mapping (uint256 => Poll) polls;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) voteSecrets;

  mapping (bytes32 => uint256) expenditurePastPolls; // expenditure slot signature => voting power
  mapping (bytes32 => uint256) expenditurePollCounts; // expenditure struct signature => count

  // Public functions (interface)

  /// @notice Create a poll in the root domain
  /// @param _target The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the root domain
  /// @param _value Reputation tree value for the root domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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

  /// @notice Create a poll in any domain
  /// @param _domainId The domain where we vote on the poll
  /// @param _childSkillIndex The childSkillIndex pointing to the domain of the action
  /// @param _target The contract to which we send the action (0x0 for the colony)
  /// @param _action A bytes array encoding a function call
  /// @param _key Reputation tree key for the domain
  /// @param _value Reputation tree value for the domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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

  /// @notice Stake on a poll
  /// @param _pollId The id of the poll
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the poll is occurring
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _amount The amount of tokens being staked
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
  function stakePoll(
    uint256 _pollId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
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

    uint256 requiredStake = getRequiredStake(_pollId);
    uint256 amount = min(_amount, sub(requiredStake, poll.stakes[_vote]));
    uint256 stakerTotalAmount = add(stakes[_pollId][msg.sender][_vote], amount);

    require(amount > 0, "voting-rep-bad-amount");

    require(
      stakerTotalAmount <= getReputationFromProof(_pollId, msg.sender, _key, _value, _branchMask, _siblings),
      "voting-rep-insufficient-rep"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, userMinStakeFraction) ||
      add(poll.stakes[_vote], amount) == requiredStake, // To prevent a residual stake from being un-stakable
      "voting-rep-insufficient-stake"
    );

    colony.obligateStake(msg.sender, poll.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msg.sender, poll.domainId, amount, address(this));

    // Update the stake
    poll.stakes[_vote] = add(poll.stakes[_vote], amount);
    stakes[_pollId][msg.sender][_vote] = stakerTotalAmount;

    // Increment counter & extend claim delay if staking for an expenditure state change
    if (
      _vote == YAY &&
      poll.stakes[YAY] == requiredStake &&
      getSig(poll.action) == CHANGE_FUNCTION &&
      add(poll.votes[NAY], poll.votes[YAY]) == 0
    ) {
      bytes32 structHash = hashExpenditureStruct(poll.action);
      expenditurePollCounts[structHash] = add(expenditurePollCounts[structHash], 1);
      bytes memory claimDelayAction = createClaimDelayAction(poll.action, UINT256_MAX);
      require(executeCall(_pollId, claimDelayAction), "voting-rep-expenditure-lock-failed");
    }

    // Move to second staking window once one side is fully staked
    if (
      (_vote == YAY && poll.stakes[YAY] == requiredStake && poll.stakes[NAY] < requiredStake) ||
      (_vote == NAY && poll.stakes[NAY] == requiredStake && poll.stakes[YAY] < requiredStake)
    ) {
      poll.events[STAKE_END] = uint64(now + stakePeriod);
      poll.events[SUBMIT_END] = uint64(now + stakePeriod + submitPeriod);
      poll.events[REVEAL_END] = uint64(now + stakePeriod + submitPeriod + revealPeriod);

      emit PollEventSet(_pollId, STAKE_END);
    }

    // Claim tokens once both sides are fully staked
    if (poll.stakes[YAY] == requiredStake && poll.stakes[NAY] == requiredStake) {
      poll.events[STAKE_END] = uint64(now);
      poll.events[SUBMIT_END] = uint64(now + submitPeriod);
      poll.events[REVEAL_END] = uint64(now + submitPeriod + revealPeriod);
      tokenLocking.claim(token, true);

      emit PollEventSet(_pollId, STAKE_END);
    }

    emit PollStaked(_pollId, msg.sender, _vote, amount);
  }

  /// @notice Submit a vote secret for a poll
  /// @param _pollId The id of the poll
  /// @param _voteSecret The hashed vote secret
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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
    require(_voteSecret != bytes32(0), "voting-rep-invalid-secret");

    uint256 userRep = getReputationFromProof(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    // Count reputation if first submission
    if (voteSecrets[_pollId][msg.sender] == bytes32(0)) {
      poll.repSubmitted = add(poll.repSubmitted, userRep);
    }

    voteSecrets[_pollId][msg.sender] = _voteSecret;

    emit PollVoteSubmitted(_pollId, msg.sender);

    if (poll.repSubmitted >= wmul(poll.skillRep, maxVoteFraction)) {
      poll.events[SUBMIT_END] = uint64(now);
      poll.events[REVEAL_END] = uint64(now + revealPeriod);

      emit PollEventSet(_pollId, SUBMIT_END);
    }
  }

  /// @notice Reveal a vote secret for a poll
  /// @param _pollId The id of the poll
  /// @param _salt The salt used to hash the vote
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @param _key Reputation tree key for the staker/domain
  /// @param _value Reputation tree value for the staker/domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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

    uint256 userRep = getReputationFromProof(_pollId, msg.sender, _key, _value, _branchMask, _siblings);

    bytes32 voteSecret = voteSecrets[_pollId][msg.sender];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");
    delete voteSecrets[_pollId][msg.sender];

    poll.votes[_vote] = add(poll.votes[_vote], userRep);
    poll.repRevealed = add(poll.repRevealed, userRep);


    uint256 fractionUserReputation = wdiv(userRep, poll.skillRep);
    uint256 totalStake = add(poll.stakes[YAY], poll.stakes[NAY]);
    uint256 voterReward = wmul(wmul(fractionUserReputation, totalStake), voterRewardFraction);

    poll.paidVoterComp = add(poll.paidVoterComp, voterReward);
    tokenLocking.transfer(token, voterReward, msg.sender, true);

    emit PollVoteRevealed(_pollId, msg.sender, _vote);

    if (poll.repRevealed == poll.repSubmitted) {
      poll.events[REVEAL_END] = uint64(now);

      emit PollEventSet(_pollId, REVEAL_END);
    }
  }

  /// @notice Escalate a poll to a higher domain
  /// @param _pollId The id of the poll
  /// @param _newDomainId The desired domain of escalation
  /// @param _childSkillIndex For the current domain, relative to the escalated domain
  /// @param _key Reputation tree key for the new domain
  /// @param _value Reputation tree value for the new domain
  /// @param _branchMask The branchmask of the proof
  /// @param _siblings The siblings of the proof
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

    poll.events[STAKE_END] = uint64(now + stakePeriod);
    poll.events[SUBMIT_END] = uint64(now + stakePeriod + submitPeriod);
    poll.events[REVEAL_END] = uint64(now + stakePeriod + submitPeriod + revealPeriod);

    poll.domainId = _newDomainId;
    poll.skillId = newDomainSkillId;
    poll.skillRep = getReputationFromProof(_pollId, address(0x0), _key, _value, _branchMask, _siblings);

    if (poll.votes[NAY] < poll.votes[YAY]) {
      poll.stakes[NAY] = sub(poll.stakes[NAY], poll.paidVoterComp);
    } else {
      poll.stakes[YAY] = sub(poll.stakes[YAY], poll.paidVoterComp);
    }

    delete poll.paidVoterComp;

    emit PollEscalated(_pollId, msg.sender, _newDomainId);

    // Check to see if the stake is unchanged, if so skip the staking period
    if (poll.stakes[NAY] == getRequiredStake(_pollId)) {
      poll.events[STAKE_END] = uint64(now);
      poll.events[SUBMIT_END] = uint64(now + submitPeriod);
      poll.events[REVEAL_END] = uint64(now + submitPeriod + revealPeriod);

      emit PollEventSet(_pollId, STAKE_END);
    }
  }

  function finalizePoll(uint256 _pollId) public {
    Poll storage poll = polls[_pollId];
    require(getPollState(_pollId) == PollState.Finalizable, "voting-rep-poll-not-executable");

    poll.finalized = true;

    bool canExecute = (
      poll.stakes[NAY] <= poll.stakes[YAY] &&
      poll.votes[NAY] <= poll.votes[YAY]
    );

    if (getSig(poll.action) == CHANGE_FUNCTION) {
      bytes32 structHash = hashExpenditureStruct(poll.action);
      expenditurePollCounts[structHash] = sub(expenditurePollCounts[structHash], 1);

      // Release the claimDelay if this is the last active poll
      if (expenditurePollCounts[structHash] == 0) {
        bytes memory claimDelayAction = createClaimDelayAction(poll.action, 0);
        require(executeCall(_pollId, claimDelayAction), "voting-rep-expenditure-unlock-failed");
      }

      uint256 requiredStake = getRequiredStake(_pollId);
      uint256 votePower = (poll.stakes[NAY] < requiredStake) ? poll.stakes[YAY] : poll.votes[YAY];
      bytes32 slotHash = hashExpenditureSlot(poll.action);

      if (expenditurePastPolls[slotHash] < votePower) {
        expenditurePastPolls[slotHash] = votePower;
        canExecute = canExecute && true;
      } else {
        canExecute = canExecute && false;
      }
    }

    bool executed;

    if (canExecute) {
      executed = executeCall(_pollId, poll.action);
    }

    emit PollFinalized(_pollId, poll.action, executed);
  }

  /// @notice Claim the staker's reward
  /// @param _pollId The id of the poll
  /// @param _permissionDomainId The domain where the extension has the arbitration permission
  /// @param _childSkillIndex For the domain in which the poll is occurring
  /// @param _user The user whose reward is being claimed
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  function claimReward(
    uint256 _pollId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _user,
    uint256 _vote
  )
    public
  {
    Poll storage poll = polls[_pollId];
    require(
      getPollState(_pollId) == PollState.Finalized ||
      getPollState(_pollId) == PollState.Failed,
      "voting-rep-not-failed-or-finalized"
    );

    uint256 stake = stakes[_pollId][_user][_vote];

    delete stakes[_pollId][_user][_vote];

    uint256 stakerReward;
    uint256 repPenalty;

    // Went to a vote, use vote to determine reward or penalty
    if (add(poll.votes[NAY],  poll.votes[YAY]) > 0) {

      uint256 loserStake = sub(
        (poll.votes[NAY] < poll.votes[YAY]) ? poll.stakes[NAY] : poll.stakes[YAY],
        poll.paidVoterComp
      );

      uint256 stakerSideVotes = poll.votes[_vote];
      uint256 totalVotes = add(poll.votes[NAY], poll.votes[YAY]);
      uint256 winFraction = wdiv(stakerSideVotes, totalVotes);
      uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0 - 2 WAD

      uint256 stakeFraction = wdiv(stake, poll.stakes[_vote]);

      if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
        stakerReward = add(stake, wmul(stakeFraction, wmul(loserStake, winShare - WAD)));
      } else {
        stakerReward = wmul(stakeFraction, wmul(loserStake, winShare));
        repPenalty = sub(stake, stakerReward);
      }

    // Your side fully staked, receive 10% (proportional) of loser's stake
    } else if (poll.stakes[_vote] == getRequiredStake(_pollId)) {

      uint256 loserStake = sub(poll.stakes[flip(_vote)], poll.paidVoterComp);
      uint256 stakeFraction = wdiv(stake, poll.stakes[_vote]);
      uint256 totalPenalty = wmul(loserStake, WAD / 10);

      stakerReward = add(stake, wmul(stakeFraction, totalPenalty));

    // Opponent's side fully staked, pay 10% penalty
    } else if (poll.stakes[flip(_vote)] == getRequiredStake(_pollId)) {

      uint256 loserStake = sub(poll.stakes[_vote], poll.paidVoterComp);
      uint256 stakeFraction = wdiv(stake, poll.stakes[_vote]);
      uint256 totalPenalty = wmul(loserStake, WAD / 10);

      stakerReward = sub(stake, wmul(stakeFraction, totalPenalty));
      repPenalty = sub(stake, stakerReward);

    // Neither side fully staked, no reward or penalty
    } else {

      uint256 totalStake = add(poll.stakes[NAY], poll.stakes[YAY]);
      uint256 rewardShare = wdiv(sub(totalStake, poll.paidVoterComp), totalStake);
      stakerReward = wmul(stake, rewardShare);
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

  /// @notice Get the total poll count
  /// @return The total poll count
  function getPollCount() public view returns (uint256) {
    return pollCount;
  }

  /// @notice Get the data for a single poll
  /// @param _pollId The id of the poll
  /// @return poll The poll struct
  function getPoll(uint256 _pollId) public view returns (Poll memory poll) {
    poll = polls[_pollId];
  }

  /// @notice Get a user's stake on a poll
  /// @param _pollId The id of the poll
  /// @param _staker The staker address
  /// @param _vote The side being supported (0 = NAY, 1 = YAY)
  /// @return The user's stake
  function getStake(uint256 _pollId, address _staker, uint256 _vote) public view returns (uint256) {
    return stakes[_pollId][_staker][_vote];
  }

  /// @notice Get the number of ongoing polls for a single expenditure / slot
  /// @param _structHash The hash of the expenditureId or expenditureId*expenditureSlot
  /// @return The number of ongoing polls
  function getExpenditurePollCount(bytes32 _structHash) public view returns (uint256) {
    return expenditurePollCounts[_structHash];
  }

  /// @notice Get the largest past vote on a single expenditure variable
  /// @param _slotHash The hash of the particular expenditure slot
  /// @return The largest past vote on this variable
  function getExpenditurePastPoll(bytes32 _slotHash) public view returns (uint256) {
    return expenditurePastPolls[_slotHash];
  }

  /// @notice Get the current state of the poll
  /// @return The current poll state
  function getPollState(uint256 _pollId) public view returns (PollState) {
    Poll storage poll = polls[_pollId];
    uint256 requiredStake = getRequiredStake(_pollId);

    // If finalized, we're done
    if (poll.finalized) {

      return PollState.Finalized;

    // Not fully staked
    } else if (
      poll.stakes[YAY] < requiredStake ||
      poll.stakes[NAY] < requiredStake
    ) {

      // Are we still staking?
      if (now < poll.events[STAKE_END]) {
        return PollState.Staking;
      // If not, did the YAY side stake?
      } else if (poll.stakes[YAY] == requiredStake) {
        return PollState.Finalizable;
      // If not, was there a prior vote we can fall back on?
      } else if (poll.votes[NAY] > 0 || poll.votes[YAY] > 0) {
        return PollState.Finalizable;
      // Otherwise, the poll failed
      } else {
        return PollState.Failed;
      }

    // Do we need to keep waiting?
    } else if (now < poll.events[STAKE_END]) {

      return PollState.Staking;

    // Fully staked, go to a vote
    } else {

      if (now < poll.events[SUBMIT_END]) {
        return PollState.Submit;
      } else if (now < poll.events[REVEAL_END]) {
        return PollState.Reveal;
      } else if (now < poll.events[REVEAL_END] + escalationPeriod) {
        return PollState.Closed;
      } else {
        return PollState.Finalizable;
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

    polls[pollCount].events[STAKE_END] = uint64(now + stakePeriod);
    polls[pollCount].events[SUBMIT_END] = uint64(now + stakePeriod + submitPeriod);
    polls[pollCount].events[REVEAL_END] = uint64(now + stakePeriod + submitPeriod + revealPeriod);

    polls[pollCount].rootHash = colonyNetwork.getReputationRootHash();
    polls[pollCount].domainId = _domainId;
    polls[pollCount].skillId = _skillId;
    polls[pollCount].skillRep = getReputationFromProof(pollCount, address(0x0), _key, _value, _branchMask, _siblings);
    polls[pollCount].target = _target;
    polls[pollCount].action = _action;

    emit PollCreated(pollCount, msg.sender, _domainId);
  }

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function getRequiredStake(uint256 _pollId) internal view returns (uint256) {
    return wmul(polls[_pollId].skillRep, totalStakeFraction);
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return 1 - _vote;
  }

  function getReputationFromProof(
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

  function hashExpenditureSlot(bytes memory action) internal returns (bytes32 hash) {
    assert(getSig(action) == CHANGE_FUNCTION);

    assembly {
      // Hash all but last (value) bytes32
      //  Recall: mload(action) gives length of bytes array
      //  So skip past the first bytes32 (length), and the last bytes32 (value)
      hash := keccak256(add(action, 0x20), sub(mload(action), 0x20))
    }
  }

  function hashExpenditureStruct(bytes memory action) internal returns (bytes32 hash) {
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
    // In brief, the first byte32 is the length of the array. Then we have
    //   4 bytes of function signature, following by an arbitrary number of
    //   additional byte32 arguments. 32 in hex is 0x20, so every increment
    //   of 0x20 represents advancing one byte, 4 is the function signature.
    // So: 0x[length][sig][args...]

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
