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

pragma solidity 0.7.3;
pragma experimental ABIEncoderV2;

import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract Salaries is ColonyExtensionMeta {

  // Events

  event SalaryCreated(uint256 salaryId);
  event SalaryClaimed(uint256 indexed salaryId, address indexed token);

  // Constants

  uint256 constant SLOT = 0;
  ColonyDataTypes.ColonyRole constant ADMINISTRATION = ColonyDataTypes.ColonyRole.Administration;
  ColonyDataTypes.ColonyRole constant FUNDING = ColonyDataTypes.ColonyRole.Funding;

  // Storage

  struct Salary {
    address payable recipient;
    uint256 domainId;
    uint256 startTime;
    uint256 endTime;
    uint256 interval;
    address[] tokens;
    uint256[] amounts;
    uint256[] lastClaimed;
  }

  uint256 numSalaries;
  mapping (uint256 => Salary) salaries;

  // Modifiers

  modifier validatePermission(uint256 _permissionDomainId, uint256 _childSkillIndex, uint256 _domainId) {
    require(
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, FUNDING, _childSkillIndex, _domainId) &&
      colony.hasInheritedUserRole(msgSender(), _permissionDomainId, ADMINISTRATION, _childSkillIndex, _domainId),
      "salaries-not-authorized"
    );
    _;
  }

  /// @notice Returns the identifier of the extension
  function identifier() public override pure returns (bytes32) {
    return keccak256("Salaries");
  }

  /// @notice Returns the version of the extension
  function version() public override pure returns (uint256) {
    return 1;
  }

  /// @notice Configures the extension
  /// @param _colony The colony in which the extension holds permissions
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  /// @notice Called when upgrading the extension
  function finishUpgrade() public override auth {}

  /// @notice Called when deprecating (or undeprecating) the extension
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }

  function createSalary(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _domainId,
    uint256 _startTime,
    uint256 _endTime,
    uint256 _interval,
    address payable _recipient,
    address[] memory _tokens,
    uint256[] memory _amounts
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, _domainId)
  {
    require(_tokens.length == _amounts.length, "salaries-bad-input");

    uint256 startTime = (_startTime == 0) ? block.timestamp : _startTime;
    uint256 endTime = (_endTime == 0) ? UINT256_MAX : _endTime;
    uint256[] memory lastClaimed = new uint256[](_tokens.length);

    salaries[++numSalaries] = Salary(
      _recipient,
      _domainId,
      startTime,
      endTime,
      _interval,
      _tokens,
      _amounts,
      lastClaimed
    );

    emit SalaryCreated(numSalaries);
  }

  function claimSalary(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id
  ) public {
    Salary storage salary = salaries[_id];

    require(salary.startTime <= block.timestamp, "salaries-too-soon-to-claim");

    uint256 domainFundingPotId = colony.getDomain(salary.domainId).fundingPotId;
    uint256[] memory amountsToClaim = new uint256[](salary.tokens.length);

    for (uint256 i; i < salary.tokens.length; i++) {
      salary.lastClaimed[i] = max(salary.lastClaimed[i], salary.startTime);

      uint256 amountClaimable = getAmountClaimable(_id, i);
      uint256 claimableProportion = getClaimableProportion(_id, i, domainFundingPotId, amountClaimable);
      amountsToClaim[i] = wmul(claimableProportion, amountClaimable);

      salary.lastClaimed[i] = add(salary.lastClaimed[i], wmul(claimableProportion, sub(block.timestamp, salary.lastClaimed[i])));
    }

    uint256 expenditureId = setupExpenditure(
      _permissionDomainId,
      _childSkillIndex,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _id,
      domainFundingPotId,
      amountsToClaim
    );

    for (uint256 i; i < salary.tokens.length; i++) {
      colony.claimExpenditurePayout(expenditureId, SLOT, salary.tokens[i]);

      emit SalaryClaimed(_id, salary.tokens[i]);
    }
  }

  function cancelSalary(uint256 _id) public {
    salaries[_id].endTime = block.timestamp;
  }

  // View

  function getSalary(uint256 _id) public view returns (Salary memory salary) {
    salary = salaries[_id];
  }

  function getAmountClaimable(uint256 _id, uint256 _tokenIdx) public view returns (uint256) {
    Salary storage salary = salaries[_id];
    uint256 durationToClaim = sub(block.timestamp, salary.lastClaimed[_tokenIdx]);
    return (durationToClaim > 0) ?
      wmul(salary.amounts[_tokenIdx], wdiv(durationToClaim, salary.interval)) :
      0;
  }

  function getClaimableProportion(
    uint256 _id,
    uint256 _tokenIdx,
    uint256 _fundingPotId,
    uint256 _amountClaimable
  )
    public
    view
    returns (uint256)
  {
    Salary storage salary = salaries[_id];
    uint256 domainBalance = colony.getFundingPotBalance(_fundingPotId, salary.tokens[_tokenIdx]);
    return min(WAD, wdiv(domainBalance, max(1, _amountClaimable)));
  }

  function getNumSalaries() public view returns (uint256) {
    return numSalaries;
  }

  // Internal

  function setupExpenditure(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _domainFundingPotId,
    uint256[] memory _amountsToClaim
  )
    internal
    returns (uint256)
  {
    Salary storage salary = salaries[_id];
    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, salary.domainId);
    uint256 expenditureFundingPotId = colony.getExpenditure(expenditureId).fundingPotId;

    for (uint256 i; i < salary.tokens.length; i++) {
      colony.moveFundsBetweenPots(
        _permissionDomainId,
        _childSkillIndex,
        salary.domainId,
        _fromChildSkillIndex,
        _toChildSkillIndex,
        _domainFundingPotId,
        expenditureFundingPotId,
        _amountsToClaim[i],
        salary.tokens[i]
      );
      colony.setExpenditurePayout(expenditureId, SLOT, salary.tokens[i], _amountsToClaim[i]);
    }

    colony.setExpenditureRecipient(expenditureId, SLOT, salary.recipient);
    colony.finalizeExpenditure(expenditureId);
    return expenditureId;
  }
}
