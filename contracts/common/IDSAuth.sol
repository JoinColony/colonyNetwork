// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity >=0.8.27;

import { DSAuthority } from "./../../lib/dappsys/auth.sol";

interface IDSAuth {
  /// @notice Set the owner of the contract
  /// @param owner_ The new owner of the contract
  function setOwner(address owner_) external;

  /// @notice Set the authority of the contract
  /// @param authority_ The new authority of the contract
  function setAuthority(DSAuthority authority_) external;
}
