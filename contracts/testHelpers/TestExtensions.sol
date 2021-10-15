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

import "../extensions/ColonyExtensionMeta.sol";


abstract contract TestExtension is ColonyExtensionMeta {
  function install(address _colony) public override auth {
    require(address(colony) == address(0x0), "extension-already-installed");

    colony = IColony(_colony);
  }

  function finishUpgrade() public override auth {} // solhint-disable-line no-empty-blocks

  function deprecate(bool _deprecated) public override auth {
    deprecated = _deprecated;
  }

  function uninstall() public override auth {
    selfdestruct(address(uint160(address(colony))));
  }
}


contract TestExtension0 is TestExtension {
  function identifier() public override pure returns (bytes32) { return keccak256("TestExtension"); }
  function version() public override pure returns (uint256) { return 0; }
}


contract TestExtension1 is TestExtension {
  function identifier() public override pure returns (bytes32) { return keccak256("TestExtension"); }
  function version() public pure override returns (uint256) { return 1; }
  function receiveEther() external payable {} // solhint-disable-line no-empty-blocks
  function foo() public notDeprecated {} // solhint-disable-line no-empty-blocks
}


contract TestExtension2 is TestExtension {
  function identifier() public override pure returns (bytes32) { return keccak256("TestExtension"); }
  function version() public pure override returns (uint256) { return 2; }
}


contract TestExtension3 is TestExtension {
  function identifier() public override pure returns (bytes32) { return keccak256("TestExtension"); }
  function version() public pure override returns (uint256) { return 3; }
}

contract TestVotingToken is TestExtension {
  function identifier() public pure override returns (bytes32) { return keccak256("VotingToken"); }
  function version() public pure override returns (uint256) { return 1; }
  function lockToken() public returns (uint256) {
    return colony.lockToken();
  }
  function unlockTokenForUser(address _user, uint256 _lockId) public {
    colony.unlockTokenForUser(_user, _lockId);
  }
}
