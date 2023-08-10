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

import "./../colony/ColonyDataTypes.sol";
import "./ColonyExtensionMeta.sol";

// ignore-file-swc-108


contract StagedExpenditure is ColonyExtensionMeta, ColonyDataTypes {

  // Events

  event ExpenditureMadeStaged(uint256 indexed expenditureId, bool staged);
  event StagedPaymentReleased(uint256 indexed expenditureId, uint256 slot);

  // Storage

  mapping (uint256 => bool) stagedExpenditures;

  // Overrides

  /// @notice Returns the identifier of the extension
  /// @return _identifier The extension's identifier
  function identifier() public override pure returns (bytes32 _identifier) {
    return keccak256("StagedExpenditure");
  }

  /// @notice Returns the version of the extension
  /// @return _version The extension's version number
  function version() public override pure returns (uint256 _version) {
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
  /// @param _deprecated Indicates whether the extension should be deprecated or undeprecated
  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  /// @notice Called when uninstalling the extension
  function uninstall() public override auth {
    selfdestruct(payable(address(colony)));
  }

  // Public

  /// @notice Mark an expenditure as staged
  /// @dev Only owner can call this function, must be in draft state
  /// @param _expenditureId Which expenditure we are changing
  /// @param _staged Indcating whether the expenditure is staged or not
  function setExpenditureStaged(uint256 _expenditureId, bool _staged) public notDeprecated {
    Expenditure memory e = IColony(colony).getExpenditure(_expenditureId);
    require(e.owner == msgSender(), "staged-expenditure-not-owner");
    require(e.status == ColonyDataTypes.ExpenditureStatus.Draft, "expenditure-not-draft");

    if (stagedExpenditures[_expenditureId] != _staged) {
      stagedExpenditures[_expenditureId] = _staged;

      emit ExpenditureMadeStaged(_expenditureId, _staged);
    }
  }

  /// @notice Release a staged payment slot and claim tokens
  /// @dev Only owner can call this function, must be in finalized state
  /// @param _permissionDomainId The domainId in which the extension has the arbitration permission
  /// @param _childSkillIndex The index that the `_expenditureId` is relative to `_permissionDomainId`,
  /// @param _expenditureId The id of the expenditure
  /// @param _slot The slot being released
  /// @param _tokens An array of payment tokens associated with the slot
  function releaseStagedPayment(
    uint256 _permissionDomainId,
    uint256 _childSkillIndex,
    uint256 _expenditureId,
    uint256 _slot,
    address[] memory _tokens
  )
    public
  {
    require(stagedExpenditures[_expenditureId], "staged-expenditure-not-staged-expenditure");

    Expenditure memory e = IColony(colony).getExpenditure(_expenditureId);
    require(e.owner == msgSender(), "staged-expenditure-not-owner");
    require(e.status == ColonyDataTypes.ExpenditureStatus.Finalized, "expenditure-not-finalized");

    bool[] memory mask = new bool[](2); mask[0] = false; mask[1] = true;
    bytes32[] memory keys = new bytes32[](2); keys[0] = bytes32(0); keys[1] = bytes32(uint256(1));
    colony.setExpenditureState(_permissionDomainId, _childSkillIndex, _expenditureId, 26, mask, keys, bytes32(0));

    for (uint256 i; i < _tokens.length; i++) {
      colony.claimExpenditurePayout(_expenditureId, _slot, _tokens[i]);
    }

    emit StagedPaymentReleased(_expenditureId, _slot);
  }
}
