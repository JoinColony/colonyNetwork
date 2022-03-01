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
  event SalaryClaimed(uint256 indexed salaryId, uint256 minClaimableProportion);

  // Constants

  uint256 constant SLOT = 0;
  ColonyDataTypes.ColonyRole constant ADMINISTRATION = ColonyDataTypes.ColonyRole.Administration;
  ColonyDataTypes.ColonyRole constant FUNDING = ColonyDataTypes.ColonyRole.Funding;

  // Storage

  struct Salary {
    address payable recipient;
    uint256 domainId;
    uint256 claimFrom;
    uint256 claimUntil;
    uint256 interval;
    address[] tokens;
    uint256[] amounts;
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
    uint256 _claimFrom,
    uint256 _claimUntil,
    uint256 _interval,
    address payable _recipient,
    address[] memory _tokens,
    uint256[] memory _amounts
  )
    public
    validatePermission(_permissionDomainId, _childSkillIndex, _domainId)
  {
    uint256 claimFrom = (_claimFrom == 0) ? block.timestamp : _claimFrom;
    uint256 claimUntil = (_claimUntil == 0) ? UINT256_MAX : _claimUntil;

    salaries[++numSalaries] = Salary(
      _recipient,
      _domainId,
      claimFrom,
      claimUntil,
      _interval,
      _tokens,
      _amounts
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

    uint256 expenditureId = colony.makeExpenditure(_permissionDomainId, _childSkillIndex, salary.domainId);
    colony.setExpenditureRecipient(expenditureId, SLOT, salary.recipient);

    uint256 domainFundingPotId = colony.getDomain(salary.domainId).fundingPotId;
    uint256 minClaimableProportion = getMinClaimableProportion(_id, domainFundingPotId);

    require(minClaimableProportion > 0, "salaries-nothing-to-claim");

    setExpenditureFunds(
      _permissionDomainId,
      _childSkillIndex,
      _fromChildSkillIndex,
      _toChildSkillIndex,
      _id,
      expenditureId,
      domainFundingPotId,
      minClaimableProportion
    );

    // Update the claimFrom in proportion to the amount claimed
    salary.claimFrom = add(salary.claimFrom, wmul(minClaimableProportion, sub(block.timestamp, salary.claimFrom)));

    colony.finalizeExpenditure(expenditureId);

    for (uint256 i; i < salary.tokens.length; i++) {
      colony.claimExpenditurePayout(expenditureId, SLOT, salary.tokens[i]);
    }

    emit SalaryClaimed(_id, minClaimableProportion);
  }

  function cancelSalary(uint256 _id) public {
    salaries[_id].claimUntil = block.timestamp;
  }

  // View

  function getSalary(uint256 _id) public view returns (Salary memory salary) {
    salary = salaries[_id];
  }

  function getAmountClaimable(uint256 _id, uint256 _tokenIdx) public view returns (uint256) {
    Salary storage salary = salaries[_id];
    uint256 durationToClaim = sub(min(block.timestamp, salary.claimUntil), salary.claimFrom);
    return (durationToClaim > 0) ?
      wmul(salary.amounts[_tokenIdx], wdiv(durationToClaim, salary.interval)) :
      0;
  }

  function getNumSalaries() public view returns (uint256) {
    return numSalaries;
  }

  // Internal

  function getMinClaimableProportion(uint256 _id, uint256 _domainFundingPotId) internal view returns (uint256) {
    uint256 amountClaimable;
    uint256 domainFundingPotBalance;
    uint256 minClaimableProportion = WAD;
    for (uint256 i; i < salaries[_id].tokens.length; i++) {
      amountClaimable = getAmountClaimable(_id, i);
      domainFundingPotBalance = colony.getFundingPotBalance(_domainFundingPotId, salaries[_id].tokens[i]);
      minClaimableProportion = min(minClaimableProportion, wdiv(domainFundingPotBalance, max(1, amountClaimable)));
    }
    return minClaimableProportion;
  }

  function setExpenditureFunds(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _fromChildSkillIndex,
    uint256 _toChildSkillIndex,
    uint256 _id,
    uint256 _expenditureId,
    uint256 _domainFundingPotId,
    uint256 _minClaimableProportion
  )
    internal
  {
    for (uint256 i; i < salaries[_id].tokens.length; i++) {
      uint256 amountToClaim = wmul(getAmountClaimable(_id, i), _minClaimableProportion);
      uint256 expenditureFundingPotId = colony.getExpenditure(_expenditureId).fundingPotId;
      address tokenAddress = salaries[_id].tokens[i];
      colony.moveFundsBetweenPots(
        _permissionDomainId,
        _childSkillIndex,
        salaries[_id].domainId,
        _fromChildSkillIndex,
        _toChildSkillIndex,
        _domainFundingPotId,
        expenditureFundingPotId,
        amountToClaim,
        tokenAddress
      );
      colony.setExpenditurePayout(_expenditureId, SLOT, salaries[_id].tokens[i], amountToClaim);
    }
  }
}
