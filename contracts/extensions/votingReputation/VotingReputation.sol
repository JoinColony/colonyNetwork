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

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

import "./../../colonyNetwork/IColonyNetwork.sol";
import "./../../colony/ColonyRoles.sol";
import "./../../common/BasicMetaTransaction.sol";
import "./../../common/ERC20Extended.sol";
import "./../../tokenLocking/ITokenLocking.sol";
import "./../ColonyExtension.sol";
import "./VotingReputationDataTypes.sol";

contract VotingReputation is ColonyExtension, BasicMetaTransaction, VotingReputationDataTypes {

  // Constants
  uint256 constant UINT128_MAX = 2**128 - 1;

  uint256 constant NAY = 0;
  uint256 constant YAY = 1;

  uint256 constant STAKE_END = 0;
  uint256 constant SUBMIT_END = 1;
  uint256 constant REVEAL_END = 2;

  uint256 constant FINALIZED_TIMESTAMP_OFFSET = 3;
  uint256 constant GLOBAL_CLAIM_DELAY_OFFSET = 4;

  bytes32 constant ROOT_ROLES = (
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Recovery) |
    bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)
  );

  bytes4 constant MULTICALL = bytes4(keccak256("multicall(bytes[])"));
  bytes4 constant NO_ACTION = 0x12345678;
  bytes4 constant OLD_MOVE_FUNDS = bytes4(keccak256(
    "moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)"
  ));
  bytes4 constant SET_EXPENDITURE_STATE = bytes4(keccak256(
    "setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)"
  ));
  bytes4 constant SET_EXPENDITURE_PAYOUT = bytes4(keccak256(
    "setExpenditurePayout(uint256,uint256,uint256,uint256,address,uint256)"
  ));


  // Initialization data
  ExtensionState state;

  IColonyNetwork colonyNetwork;
  ITokenLocking tokenLocking;
  address token;

  // All `Fraction` variables are stored as WADs i.e. fixed-point numbers with 18 digits after the radix. So
  // 1 WAD = 10**18, which is interpreted as 1.

  uint256 totalStakeFraction; // Fraction of the domain's reputation needed to stake on each side in order to go to a motion.
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

  uint256 motionCount;
  mapping (uint256 => Motion) motions;
  mapping (uint256 => mapping (address => mapping (uint256 => uint256))) stakes;
  mapping (uint256 => mapping (address => bytes32)) voteSecrets;

  mapping (uint256 => uint256) expenditurePastVotes; // expenditureId => voting power
  mapping (uint256 => uint256) expenditureMotionLocks; // expenditureId => active motionId

  mapping(address => uint256) metatransactionNonces;

  function getMetatransactionNonce(address _userAddress) override public view returns (uint256 _nonce){
    // This offset is a result of fixing the storage layout, and having to prevent metatransactions being able to be replayed as a result
    // of the nonce resetting. The broadcaster has made ~3000 transactions in total at time of commit, so we definitely won't have a single
    // account at 1 million nonce by then.
    return metatransactionNonces[_userAddress] + 1000000;
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user]++;
  }

  // Modifiers

  modifier onlyRoot() {
    require(colony.hasUserRole(msgSender(), 1, ColonyDataTypes.ColonyRole.Root), "voting-rep-caller-not-root");
    _;
  }

  // Public

  function identifier() public override pure returns (bytes32 _identifier) {
    return keccak256("VotingReputation");
  }

  function version() public pure override returns (uint256 _version) {
    return 10;
  }

  function install(address _colony) public override {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
    colonyNetwork = IColonyNetwork(colony.getColonyNetwork());
    tokenLocking = ITokenLocking(colonyNetwork.getTokenLocking());
    token = colony.getToken();
  }

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
    onlyRoot
  {
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

  function finishUpgrade() public override auth {
  } // solhint-disable-line no-empty-blocks

  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  function uninstall() public override auth {
    selfdestruct(payable(address(colony)));
  }

  // Public functions (interface)

 function createMotion(
    uint256 _domainId,
    uint256 _childSkillIndex,
    address _altTarget,
    bytes memory _action,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
    notDeprecated
  {
    require(state == ExtensionState.Active, "voting-rep-not-active");
    require(_altTarget != address(colony), "voting-rep-alt-target-cannot-be-base-colony");

    address target = getTarget(_altTarget);
    bytes4 action = getSig(_action);

    require(action != OLD_MOVE_FUNDS, "voting-rep-disallowed-function");

    uint256 skillId;

    if ( action == NO_ACTION ) {
      // This special action indication 'no action' for simple decisions, but
      // there's no such function signature, so colonies don't know about it, and there's
      // no domain to extract from the 'action'
      // We effectively assert the 'action' is taking place in the domain the simple decision
      // is taking place in
      require(_childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      skillId = colony.getDomain(_domainId).skillId;

    } else if (ColonyRoles(target).getCapabilityRoles(action) | ROOT_ROLES == ROOT_ROLES) {

      // A root or unpermissioned function
      require(_domainId == 1 && _childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      skillId = colony.getDomain(1).skillId;

    } else {

      // A domain permissioned function
      skillId = colony.getDomain(_domainId).skillId;
      uint256 actionDomainSkillId = getActionDomainSkillId(_action);

      if (skillId != actionDomainSkillId) {
        uint256 childSkillId = colonyNetwork.getChildSkillId(skillId, _childSkillIndex);
        require(childSkillId == actionDomainSkillId, "voting-rep-invalid-domain-id");
      } else {
        require(_childSkillIndex == UINT256_MAX, "voting-rep-invalid-domain-id");
      }
    }

    motionCount += 1;
    Motion storage motion = motions[motionCount];

    motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);

    motion.rootHash = colonyNetwork.getReputationRootHash();
    motion.domainId = _domainId;
    motion.skillId = skillId;

    motion.skillRep = checkReputation(motion.rootHash, skillId, address(0x0), _key, _value, _branchMask, _siblings);
    require(motion.skillRep > 0, "voting-rep-no-reputation-in-domain");
    motion.altTarget = _altTarget;
    motion.action = _action;

    emit MotionCreated(motionCount, msgSender(), _domainId);
  }

  function stakeMotion(
    uint256 _motionId,
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
    Motion storage motion = motions[_motionId];
    require(_vote <= 1, "voting-rep-bad-vote");
    require(getMotionState(_motionId) == MotionState.Staking, "voting-rep-motion-not-staking");

    uint256 requiredStake = getRequiredStake(_motionId);
    uint256 amount = min(_amount, requiredStake - motion.stakes[_vote]);
    require(amount > 0, "voting-rep-bad-amount");

    uint256 stakerTotalAmount = stakes[_motionId][msgSender()][_vote] + amount;

    require(
      stakerTotalAmount <= checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings),
      "voting-rep-insufficient-rep"
    );
    require(
      stakerTotalAmount >= wmul(requiredStake, userMinStakeFraction) ||
      (motion.stakes[_vote] + amount) == requiredStake, // To prevent a residual stake from being un-stakable
      "voting-rep-insufficient-stake"
    );

    // Update the stake
    motion.stakes[_vote] += amount;
    stakes[_motionId][msgSender()][_vote] = stakerTotalAmount;

    // Increment counter & extend claim delay if staking for an expenditure state change
    if (
      _vote == YAY &&
      !motion.escalated &&
      motion.stakes[YAY] == requiredStake && (
        getSig(motion.action) == SET_EXPENDITURE_STATE ||
        getSig(motion.action) == SET_EXPENDITURE_PAYOUT
      ) && motion.altTarget == address(0x0)
    ) {
      lockExpenditure(_motionId);
    }

    emit MotionStaked(_motionId, msgSender(), _vote, amount);

    // Move to vote submission once both sides are fully staked
    if (motion.stakes[NAY] == requiredStake && motion.stakes[YAY] == requiredStake) {
      motion.events[STAKE_END] = uint64(block.timestamp);
      motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
      motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);

      emit MotionEventSet(_motionId, STAKE_END);

    // Move to second staking window once one side is fully staked
    } else if (
      (_vote == NAY && motion.stakes[NAY] == requiredStake) ||
      (_vote == YAY && motion.stakes[YAY] == requiredStake)
    ) {
      motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);

      // New stake supersedes prior votes
      delete motion.votes;
      delete motion.repSubmitted;

      emit MotionEventSet(_motionId, STAKE_END);
    }

    // Do the external bookkeeping
    tokenLocking.deposit(token, 0, true); // Faux deposit to clear any locks
    colony.obligateStake(msgSender(), motion.domainId, amount);
    colony.transferStake(_permissionDomainId, _childSkillIndex, address(this), msgSender(), motion.domainId, amount, address(this));
  }

  function submitVote(
    uint256 _motionId,
    bytes32 _voteSecret,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Submit, "voting-rep-motion-not-open");
    require(_voteSecret != bytes32(0), "voting-rep-invalid-secret");

    uint256 userRep = checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings);

    // Count reputation if first submission
    if (voteSecrets[_motionId][msgSender()] == bytes32(0)) {
      motion.repSubmitted += userRep;
    }

    voteSecrets[_motionId][msgSender()] = _voteSecret;

    emit MotionVoteSubmitted(_motionId, msgSender());

    if (motion.repSubmitted >= wmul(motion.skillRep, maxVoteFraction)) {
      motion.events[SUBMIT_END] = uint64(block.timestamp);
      motion.events[REVEAL_END] = uint64(block.timestamp + revealPeriod);

      emit MotionEventSet(_motionId, SUBMIT_END);
    }
  }

  function revealVote(
    uint256 _motionId,
    bytes32 _salt,
    uint256 _vote,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Reveal, "voting-rep-motion-not-reveal");
    require(_vote <= 1, "voting-rep-bad-vote");

    uint256 userRep = checkReputation(motion.rootHash, motion.skillId, msgSender(), _key, _value, _branchMask, _siblings);
    motion.votes[_vote] += userRep;

    bytes32 voteSecret = voteSecrets[_motionId][msgSender()];
    require(voteSecret == getVoteSecret(_salt, _vote), "voting-rep-secret-no-match");
    delete voteSecrets[_motionId][msgSender()];

    uint256 voterReward = getVoterReward(_motionId, userRep);
    motion.paidVoterComp += voterReward;

    emit MotionVoteRevealed(_motionId, msgSender(), _vote);

    // See if reputation revealed matches reputation submitted
    if ((motion.votes[NAY] + motion.votes[YAY]) == motion.repSubmitted) {
      motion.events[REVEAL_END] = uint64(block.timestamp);

      emit MotionEventSet(_motionId, REVEAL_END);
    }

    tokenLocking.transfer(token, voterReward, msgSender(), true);
  }

  function escalateMotion(
    uint256 _motionId,
    uint256 _newDomainId,
    uint256 _childSkillIndex,
    bytes memory _key,
    bytes memory _value,
    uint256 _branchMask,
    bytes32[] memory _siblings
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Closed, "voting-rep-motion-not-closed");

    uint256 newDomainSkillId = colony.getDomain(_newDomainId).skillId;
    uint256 childSkillId = colonyNetwork.getChildSkillId(newDomainSkillId, _childSkillIndex);
    require(childSkillId == motion.skillId, "voting-rep-invalid-domain-proof");

    uint256 domainId = motion.domainId;
    motion.domainId = _newDomainId;
    motion.skillId = newDomainSkillId;
    motion.skillRep = checkReputation(motion.rootHash, motion.skillId, address(0x0), _key, _value, _branchMask, _siblings);

    uint256 loser = (motion.votes[NAY] < motion.votes[YAY]) ? NAY : YAY;
    motion.stakes[loser] -= motion.paidVoterComp;
    motion.pastVoterComp[loser] += motion.paidVoterComp;
    delete motion.paidVoterComp;

    uint256 requiredStake = getRequiredStake(_motionId);

    if (motion.stakes[NAY] < requiredStake || motion.stakes[YAY] < requiredStake) {
      motion.events[STAKE_END] = uint64(block.timestamp + stakePeriod);
    } else {
      motion.events[STAKE_END] = uint64(block.timestamp);
      motion.events[SUBMIT_END] = motion.events[STAKE_END] + uint64(submitPeriod);
      motion.events[REVEAL_END] = motion.events[SUBMIT_END] + uint64(revealPeriod);
    }

    motion.escalated = true;

    emit MotionEscalated(_motionId, msgSender(), domainId, _newDomainId);

    if (motion.events[STAKE_END] <= uint64(block.timestamp)) {
      emit MotionEventSet(_motionId, STAKE_END);
    }
  }

  function finalizeMotion(uint256 _motionId) public {
    Motion storage motion = motions[_motionId];
    require(getMotionState(_motionId) == MotionState.Finalizable, "voting-rep-motion-not-finalizable");

    assert(
      motion.stakes[YAY] == getRequiredStake(_motionId) ||
      (motion.votes[NAY] + motion.votes[YAY]) > 0
    );

    motion.finalized = true;

    bool canExecute = (
      motion.stakes[NAY] < motion.stakes[YAY] ||
      motion.votes[NAY] < motion.votes[YAY]
    );

    if ((
        getSig(motion.action) == SET_EXPENDITURE_STATE ||
        getSig(motion.action) == SET_EXPENDITURE_PAYOUT
      ) && getTarget(motion.altTarget) == address(colony)
    ) {
      uint256 expenditureId = getExpenditureId(motion.action);

      assert(expenditureMotionLocks[expenditureId] == _motionId);
      delete expenditureMotionLocks[expenditureId];

      uint256 currentClaimDelay = colony.getExpenditure(expenditureId).globalClaimDelay;
      bytes memory claimDelayAction = createExpenditureAction(motion.action, GLOBAL_CLAIM_DELAY_OFFSET, currentClaimDelay - 365 days);
      // No require this time, since we don't want stakes to be permanently locked
      executeCall(_motionId, claimDelayAction);

      if (colony.getExpenditure(expenditureId).status == ColonyDataTypes.ExpenditureStatus.Finalized) {
        bytes memory finalizedTimestampAction = createExpenditureAction(motion.action, FINALIZED_TIMESTAMP_OFFSET, block.timestamp);
        executeCall(_motionId, finalizedTimestampAction);
      }

      uint256 votePower = (motion.votes[NAY] + motion.votes[YAY]) > 0 ?
        motion.votes[YAY] : motion.stakes[YAY];
      if (expenditurePastVotes[expenditureId] < votePower) {
        expenditurePastVotes[expenditureId] = votePower;
      } else if (motion.domainId > 1) {
        canExecute = false;
      }
    }

    bool executed;

    if (canExecute) {
      executed = executeCall(_motionId, motion.action);
      require(executed || failingExecutionAllowed(_motionId), "voting-execution-failed-not-one-week");
    }

    emit MotionFinalized(_motionId, motion.action, executed);
  }

  function failingExecutionAllowed(uint256 _motionId) public view returns (bool _allowed) {
    Motion storage motion = motions[_motionId];
    uint256 requiredStake = getRequiredStake(_motionId);

    // Failing execution is allowed if we didn't fully stake, and it's been a week since staking ended
    if (motion.stakes[YAY] < requiredStake || motion.stakes[NAY] < requiredStake) {
      return block.timestamp >= motion.events[STAKE_END] + 7 days;
    } else {
      // It was fully staked, and went to a vote.
      // Failing execution is also allowed if it's been a week since reveal ended
      return block.timestamp >= motion.events[REVEAL_END] + 7 days;
    }
  }

  function claimReward(
    uint256 _motionId,
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    address _staker,
    uint256 _vote
  )
    public
  {
    Motion storage motion = motions[_motionId];
    require(
      getMotionState(_motionId) == MotionState.Finalized ||
      getMotionState(_motionId) == MotionState.Failed,
      "voting-rep-motion-not-claimable"
    );

    (uint256 stakerReward, uint256 repPenalty) = getStakerReward(_motionId, _staker, _vote);

    require(stakes[_motionId][_staker][_vote] > 0, "voting-rep-nothing-to-claim");
    delete stakes[_motionId][_staker][_vote];

    tokenLocking.transfer(token, stakerReward, _staker, true);

    if (repPenalty > 0) {
      colony.emitDomainReputationPenalty(
        _permissionDomainId,
        _childSkillIndex,
        motion.domainId,
        _staker,
        -int256(repPenalty)
      );
    }

    emit MotionRewardClaimed(_motionId, _staker, _vote, stakerReward);
  }

  // Public view functions

  function getTotalStakeFraction() public view returns (uint256 _fraction) {
    return totalStakeFraction;
  }

  function getVoterRewardFraction() public view returns (uint256 _fraction) {
    return voterRewardFraction;
  }

  function getUserMinStakeFraction() public view returns (uint256 _fraction) {
    return userMinStakeFraction;
  }

  function getMaxVoteFraction() public view returns (uint256 _fraction) {
    return maxVoteFraction;
  }

  function getStakePeriod() public view returns (uint256 _period) {
    return stakePeriod;
  }

  function getSubmitPeriod() public view returns (uint256 _period) {
    return submitPeriod;
  }

  function getRevealPeriod() public view returns (uint256 _period) {
    return revealPeriod;
  }

  function getEscalationPeriod() public view returns (uint256 _period) {
    return escalationPeriod;
  }

  function getMotionCount() public view returns (uint256 _count) {
    return motionCount;
  }

  function getMotion(uint256 _motionId) public view returns (Motion memory _motion) {
    _motion = motions[_motionId];
  }

  function getStake(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256 _stake) {
    return stakes[_motionId][_staker][_vote];
  }

  function getExpenditureMotionLock(uint256 _expenditureId) public view returns (uint256 _motionId) {
    return expenditureMotionLocks[_expenditureId];
  }

  function getExpenditurePastVote(uint256 _expenditureId) public view returns (uint256 _vote) {
    return expenditurePastVotes[_expenditureId];
  }

  function getMotionState(uint256 _motionId) public view returns (MotionState _motionState) {
    Motion storage motion = motions[_motionId];
    uint256 requiredStake = getRequiredStake(_motionId);

    // Check for valid motion Id / motion
    if (_motionId == 0 || _motionId > motionCount || motion.action.length == 0) {

      return MotionState.Null;

    // If finalized, we're done
    } else if (motion.finalized) {

      return MotionState.Finalized;

    // Not fully staked
    } else if (
      motion.stakes[YAY] < requiredStake ||
      motion.stakes[NAY] < requiredStake
    ) {

      // Are we still staking?
      if (block.timestamp < motion.events[STAKE_END]) {
        return MotionState.Staking;
      // If not, did the YAY side stake?
      } else if (motion.stakes[YAY] == requiredStake) {
        return finalizableOrFinalized(motion.action);
      // If not, was there a prior vote we can fall back on?
      } else if (motion.votes[NAY] + motion.votes[YAY] > 0) {
        return finalizableOrFinalized(motion.action);
      // Otherwise, the motion failed
      } else {
        return MotionState.Failed;
      }

    // Fully staked, go to a vote
    } else {

      if (block.timestamp < motion.events[SUBMIT_END]) {
        return MotionState.Submit;
      } else if (block.timestamp < motion.events[REVEAL_END]) {
        return MotionState.Reveal;
      } else if (
        block.timestamp < motion.events[REVEAL_END] + escalationPeriod &&
        motion.domainId > 1
      ) {
        return MotionState.Closed;
      } else {
        return finalizableOrFinalized(motion.action);
      }
    }
  }

  // If we decide that the motion is finalizable, we might actually want it to report as finalized if it's a no-action
  // motion.
  function finalizableOrFinalized(bytes memory action) internal pure returns (MotionState) {
    return getSig(action) == NO_ACTION ? MotionState.Finalized : MotionState.Finalizable;
  }

  function getVoterReward(uint256 _motionId, uint256 _voterRep) public view returns (uint256 _reward) {
    Motion storage motion = motions[_motionId];
    uint256 fractionUserReputation = wdiv(_voterRep, motion.repSubmitted);
    uint256 totalStake = motion.stakes[YAY] + motion.stakes[NAY];
    return wmul(wmul(fractionUserReputation, totalStake), voterRewardFraction);
  }

  function getVoterRewardRange(uint256 _motionId, uint256 _voterRep, address _voterAddress) public view returns (uint256 _rewardMin, uint256 _rewardMax) {
    Motion storage motion = motions[_motionId];
    // The minimum reward is when everyone has voted, with a total weight of motion.skillRep
    uint256 minFractionUserReputation = wdiv(_voterRep, motion.skillRep);

    // The maximum reward is when this user is the only other person who votes (if they haven't already),
    // aside from those who have already done so
    uint256 voteTotal = motion.repSubmitted;
    // Has the user already voted?
    if (voteSecrets[_motionId][_voterAddress] == bytes32(0)) {
      // They have not, so add their rep
      voteTotal += _voterRep;
    }
    uint256 maxFractionUserReputation = wdiv(_voterRep, voteTotal);

    uint256 totalStake = motion.stakes[YAY] + motion.stakes[NAY];
    return (
      wmul(wmul(minFractionUserReputation, totalStake), voterRewardFraction),
      wmul(wmul(maxFractionUserReputation, totalStake), voterRewardFraction)
    );
  }

  function getStakerReward(uint256 _motionId, address _staker, uint256 _vote) public view returns (uint256 _reward, uint256 _penalty) {
    Motion storage motion = motions[_motionId];

    uint256 totalSideStake = motion.stakes[_vote] + motion.pastVoterComp[_vote];
    if (totalSideStake == 0) { return (0, 0); }

    uint256 stakeFraction = wdiv(stakes[_motionId][_staker][_vote], totalSideStake);

    uint256 realStake = wmul(stakeFraction, motion.stakes[_vote]);

    uint256 stakerReward;
    uint256 repPenalty;

    // Went to a vote, use vote to determine reward or penalty
    if ((motion.votes[NAY] + motion.votes[YAY]) > 0) {

      uint256 loserStake;
      uint256 winnerStake;
      if (motion.votes[YAY] > motion.votes[NAY]){
        loserStake = motion.stakes[NAY];
        winnerStake = motion.stakes[YAY];
      } else {
        loserStake = motion.stakes[YAY];
        winnerStake = motion.stakes[NAY];
      }

      loserStake -= motion.paidVoterComp;
      uint256 totalVotes = motion.votes[NAY] + motion.votes[YAY];
      uint256 winFraction = wdiv(motion.votes[_vote], totalVotes);
      uint256 winShare = wmul(winFraction, 2 * WAD); // On a scale of 0-2 WAD

      if (winShare > WAD || (winShare == WAD && _vote == NAY)) {
        // 50% gets 0% of loser's stake, 100% gets 100% of loser's stake, linear in between
        stakerReward = wmul(stakeFraction, (winnerStake + wmul(loserStake, winShare - WAD)));
      } else {
        stakerReward = wmul(stakeFraction, wmul(loserStake, winShare));
        repPenalty = realStake - stakerReward;
      }

    // Determine rewards based on stakes alone
    } else {
      assert(motion.paidVoterComp == 0);
      uint256 requiredStake = getRequiredStake(_motionId);

      // Your side fully staked, receive 10% (proportional) of loser's stake
      if (
        motion.stakes[_vote] == requiredStake &&
        motion.stakes[flip(_vote)] < requiredStake
      ) {

        uint256 loserStake = motion.stakes[flip(_vote)];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, (requiredStake + totalPenalty));

      // Opponent's side fully staked, pay 10% penalty
      } else if (
        motion.stakes[_vote] < requiredStake &&
        motion.stakes[flip(_vote)] == requiredStake
      ) {

        uint256 loserStake = motion.stakes[_vote];
        uint256 totalPenalty = wmul(loserStake, WAD / 10);
        stakerReward = wmul(stakeFraction, loserStake - totalPenalty);
        repPenalty = realStake - stakerReward;

      // Neither side fully staked (or no votes were revealed), no reward or penalty
      } else {

        stakerReward = realStake;

      }
    }

    return (stakerReward, repPenalty);
  }

  // Internal functions

  function getVoteSecret(bytes32 _salt, uint256 _vote) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_salt, _vote));
  }

  function getRequiredStake(uint256 _motionId) internal view returns (uint256) {
    return wmul(motions[_motionId].skillRep, totalStakeFraction);
  }

  function getTarget(address _target) internal view returns (address) {
    return (_target == address(0x0)) ? address(colony) : _target;
  }

  function flip(uint256 _vote) internal pure returns (uint256) {
    return 1 - _vote;
  }

  function getActionDomainSkillId(bytes memory _action) internal view returns (uint256) {
    uint256 permissionDomainId;
    uint256 childSkillIndex;

    assembly {
      permissionDomainId := mload(add(_action, 0x24))
      childSkillIndex := mload(add(_action, 0x44))
    }

    uint256 permissionSkillId = colony.getDomain(permissionDomainId).skillId;
    return colonyNetwork.getChildSkillId(permissionSkillId, childSkillIndex);
  }

  function lockExpenditure(uint256 _motionId) internal {
    Motion storage motion = motions[_motionId];
    uint256 expenditureId = getExpenditureId(motion.action);

    // If the expenditure is already locked, this motion is a no-op
    if (expenditureMotionLocks[expenditureId] > 0) {
      motion.finalized = true;
    } else {
      expenditureMotionLocks[expenditureId] = _motionId;
      uint256 currentClaimDelay = colony.getExpenditure(expenditureId).globalClaimDelay;
      bytes memory claimDelayAction = createExpenditureAction(motion.action, GLOBAL_CLAIM_DELAY_OFFSET, currentClaimDelay + 365 days);
      require(executeCall(_motionId, claimDelayAction), "voting-rep-expenditure-lock-failed");
    }
  }

  function executeCall(uint256 motionId, bytes memory action) internal returns (bool success) {
    address to = getTarget(motions[motionId].altTarget);

    assembly {
              // call contract at address a with input mem[in…(in+insize))
              //   providing g gas and v wei and output area mem[out…(out+outsize))
              //   returning 0 on error (eg. out of gas) and 1 on success

              // call(g,   a,  v, in,                insize,        out, outsize)
      success := call(gas(), to, 0, add(action, 0x20), mload(action), 0, 0)
    }
  }

  function getSig(bytes memory action) internal pure returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }

  function getMulticallSigs(bytes memory action) internal pure returns (bytes4[] memory sigs) {
    uint256 numSigs;

    assembly {
      numSigs := mload(add(action, 0x44))
    }

    sigs = new bytes4[](numSigs);
    uint256 currentLoc;
    bytes4 currentSig;

    for (uint256 i; i < sigs.length; i++) {
      assembly {
        currentLoc := mload(add(add(action, 0x64), mul(i, 0x20)))
        currentSig := mload(add(add(action, 0x84), currentLoc))
      }
      sigs[i] = currentSig;
    }

    return sigs;
  }

  function getExpenditureId(bytes memory action) internal pure returns (uint256 expenditureId) {
    bytes4 sig = getSig(action);
    assert(sig == SET_EXPENDITURE_STATE || sig == SET_EXPENDITURE_PAYOUT);

    assembly {
      expenditureId := mload(add(action, 0x64))
    }
  }

  function createExpenditureAction(
    bytes memory action,
    uint256 offset,
    uint256 value
  )
    public
    pure
    returns (bytes memory)
  {
    // See https://solidity.readthedocs.io/en/develop/abi-spec.html#use-of-dynamic-types
    //  for documentation on how the action `bytes` is encoded
    // In brief, the first byte32 is the length of the array. Then we have
    //   4 bytes of function signature, following by an arbitrary number of
    //   additional byte32 arguments. 32 in hex is 0x20, so every increment
    //   of 0x20 represents advancing one byte, 4 is the function signature.
    // So: 0x[length][sig][args...]

    bytes4 sig = getSig(action);
    assert(sig == SET_EXPENDITURE_STATE || sig == SET_EXPENDITURE_PAYOUT);

    bytes4 functionSignature = SET_EXPENDITURE_STATE;

    uint256 permissionDomainId;
    uint256 childSkillIndex;
    uint256 expenditureId;
    bytes memory expenditureAction = new bytes(4 + 32 * 11); // 356 bytes

    assembly {
      permissionDomainId := mload(add(action, 0x24))
      childSkillIndex := mload(add(action, 0x44))
      expenditureId := mload(add(action, 0x64))

      mstore(add(expenditureAction, 0x20), functionSignature)
      mstore(add(expenditureAction, 0x24), permissionDomainId)
      mstore(add(expenditureAction, 0x44), childSkillIndex)
      mstore(add(expenditureAction, 0x64), expenditureId)
      mstore(add(expenditureAction, 0x84), 25)      // expenditure storage slot
      mstore(add(expenditureAction, 0xa4), 0xe0)    // mask location
      mstore(add(expenditureAction, 0xc4), 0x120)   // keys location
      mstore(add(expenditureAction, 0xe4), value)
      mstore(add(expenditureAction, 0x104), 1)      // mask length
      mstore(add(expenditureAction, 0x124), 1)      // offset
      mstore(add(expenditureAction, 0x144), 1)      // keys length
      mstore(add(expenditureAction, 0x164), offset) // expenditure struct offset
    }

    return expenditureAction;
  }
}
