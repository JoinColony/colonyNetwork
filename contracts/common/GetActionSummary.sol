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

import { IColony } from "./../colony/IColony.sol";
import { ExtractCallData } from "./ExtractCallData.sol";
import { GetActionDomainSkillId } from "./GetActionDomainSkillId.sol";
import { ColonyDataTypes } from "./../colony/ColonyDataTypes.sol";
import { ColonyRoles } from "./../colony/ColonyRoles.sol";

pragma solidity 0.8.21;
pragma experimental ABIEncoderV2;

struct ActionSummary {
  bytes4 sig;
  uint256 domainSkillId;
  uint256 expenditureId;
}

contract GetActionSummary is ExtractCallData, GetActionDomainSkillId {
  bytes4 constant MULTICALL = bytes4(keccak256("multicall(bytes[])"));
  bytes4 constant NO_ACTION = 0x12345678;
  bytes4 constant OLD_MOVE_FUNDS =
    bytes4(
      keccak256("moveFundsBetweenPots(uint256,uint256,uint256,uint256,uint256,uint256,address)")
    );
  bytes4 constant SET_EXPENDITURE_STATE =
    bytes4(
      keccak256("setExpenditureState(uint256,uint256,uint256,uint256,bool[],bytes32[],bytes32)")
    );
  bytes4 constant SET_EXPENDITURE_PAYOUT =
    bytes4(keccak256("setExpenditurePayout(uint256,uint256,uint256,uint256,address,uint256)"));

  bytes32 constant ROOT_ROLES = ((bytes32(uint256(1)) <<
    uint8(ColonyDataTypes.ColonyRole.Recovery)) |
    (bytes32(uint256(1)) << uint8(ColonyDataTypes.ColonyRole.Root)));

  function getExpenditureId(bytes memory action) internal pure returns (uint256 expenditureId) {
    bytes4 sig = getSig(action);
    assert(isExpenditureSig(sig));

    assembly {
      expenditureId := mload(add(action, 0x64))
    }
  }

  function getActionSummary(
    address colonyNetworkAddress,
    address colonyAddress,
    bytes memory _action,
    address _altTarget
  ) public view returns (ActionSummary memory) {
    address target = getTarget(_altTarget, colonyAddress);
    bytes[] memory actions;

    if (getSig(_action) == MULTICALL) {
      actions = abi.decode(extractCalldata(_action), (bytes[]));
    } else {
      actions = new bytes[](1);
      actions[0] = _action;
    }

    ActionSummary memory summary;

    for (uint256 i; i < actions.length; i++) {
      bytes4 sig = getSig(actions[i]);
      uint256 expenditureId;
      uint256 domainSkillId;

      if (sig == NO_ACTION || sig == OLD_MOVE_FUNDS) {
        // If any of the actions are NO_ACTION or OLD_MOVE_FUNDS, the entire multicall is such and we break
        return ActionSummary({ sig: sig, domainSkillId: 0, expenditureId: 0 });
      } else if (isExpenditureSig(sig)) {
        // If it is an expenditure action, we record the expenditure and domain ids,
        //  and ensure they are consistent throughout the multicall.
        //  If not, we return UINT256_MAX which represents an invalid multicall
        summary.sig = sig;
        domainSkillId = getActionDomainSkillId(actions[i], colonyNetworkAddress, colonyAddress);
        expenditureId = getExpenditureId(actions[i]);

        if (summary.domainSkillId > 0 && summary.domainSkillId != domainSkillId) {
          // Invalid multicall, caller should handle appropriately
          return
            ActionSummary({ sig: bytes4(0x0), domainSkillId: type(uint256).max, expenditureId: 0 });
        } else {
          summary.domainSkillId = domainSkillId;
        }

        if (summary.expenditureId > 0 && summary.expenditureId != expenditureId) {
          // Invalid multicall, caller should handle appropriately
          return
            ActionSummary({ sig: bytes4(0x0), domainSkillId: 0, expenditureId: type(uint256).max });
        } else {
          summary.expenditureId = expenditureId;
        }
      } else {
        // Otherwise we record the domain id and ensure it is consistent throughout the multicall
        // If no expenditure signatures have been seen, we record the latest signature
        // TODO: explicitly check `isExtension` for target, currently this simply errors
        if (ColonyRoles(target).getCapabilityRoles(sig) | ROOT_ROLES == ROOT_ROLES) {
          domainSkillId = IColony(colonyAddress).getDomain(1).skillId;
        } else {
          domainSkillId = getActionDomainSkillId(actions[i], colonyNetworkAddress, colonyAddress);
        }

        if (summary.domainSkillId > 0 && summary.domainSkillId != domainSkillId) {
          // Invalid multicall, caller should handle appropriately
          return
            ActionSummary({ sig: bytes4(0x0), domainSkillId: type(uint256).max, expenditureId: 0 });
        } else {
          summary.domainSkillId = domainSkillId;
        }

        if (!isExpenditureSig(summary.sig)) {
          summary.sig = sig;
        }
      }
    }

    return summary;
  }

  function isExpenditureSig(bytes4 sig) internal pure returns (bool) {
    return sig == SET_EXPENDITURE_STATE || sig == SET_EXPENDITURE_PAYOUT;
  }

  function getTarget(address _target, address colonyAddress) internal view returns (address) {
    return (_target == address(0x0)) ? colonyAddress : _target;
  }

  function getSig(bytes memory action) internal pure returns (bytes4 sig) {
    assembly {
      sig := mload(add(action, 0x20))
    }
  }
}
