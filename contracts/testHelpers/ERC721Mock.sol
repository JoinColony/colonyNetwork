// SPDX-License-Identifier: GPL-3.0-or-later
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

pragma solidity 0.8.23;

contract ERC721Mock {
  event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

  // Mapping owner address to token count
  mapping(address => uint256) private _balances;

  // Mapping from token ID to owner address
  mapping(uint256 => address) private _owners;

  // Mapping from owner to operator approvals
  mapping(address => mapping(address => bool)) private _operatorApprovals;

  function mint(address to, uint256 tokenId) external virtual {
    require(to != address(0), "ERC721: mint to the zero address");

    _balances[to] += 1;

    _owners[tokenId] = to;

    emit Transfer(address(0), to, tokenId);
  }

  function balanceOf(address owner) public view virtual returns (uint256) {
    require(owner != address(0), "ERC721: address zero is not a valid owner");
    return _balances[owner];
  }

  function ownerOf(uint256 tokenId) public view virtual returns (address) {
    address owner = _owners[tokenId];
    require(owner != address(0), "ERC721: invalid token ID");
    return owner;
  }

  function safeTransferFrom(address from, address to, uint256 tokenId) public virtual {
    require(msg.sender == ownerOf(tokenId), "ERC721: caller is not token owner or approved");
    // just using simple transfer for mock purposes.
    _transfer(from, to, tokenId);
  }

  function _transfer(address from, address to, uint256 tokenId) internal virtual {
    require(ownerOf(tokenId) == from, "ERC721: transfer from incorrect owner");
    require(to != address(0), "ERC721: transfer to the zero address");

    _balances[from] -= 1;
    _balances[to] += 1;

    _owners[tokenId] = to;

    emit Transfer(from, to, tokenId);
  }
}
