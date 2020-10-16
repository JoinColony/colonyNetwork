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

pragma solidity >=0.7.3; // ignore-swc-103
pragma experimental ABIEncoderV2;

// Note that we have deliberately left the fallback function off here to accommodate
// address / address payable conversion issues where we want to use this.


interface IEtherRouter {
  /// @notice Sets the resolver address. This is used in the routing of all delegatecalls by the EtherRouter.
  /// @param _resolver Address of the new Resolver
  function setResolver(address _resolver) external;

  /// @notice Sets the EtherRouter owner. Inherited from DSAuth.
  /// @param owner_ Address of the new owner
  function setOwner(address owner_) external;

  /// @notice Sets the EtherRouter authority. Inherited from DSAuth.
  /// @param authority_ Address of the new DSAuthority instance
  function setAuthority(address authority_) external;
}
