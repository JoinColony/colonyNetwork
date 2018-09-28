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

pragma solidity ^0.4.23;
pragma experimental "v0.5.0";

import "./ColonyNetworkStorage.sol";

contract ColonyNetworkAuction is ColonyNetworkStorage {
  event AuctionCreated(address auction, address token, uint256 quantity);

  function startTokenAuction(address _token) public stoppable {
    uint lastAuctionTimestamp = recentAuctions[_token];
    require(lastAuctionTimestamp == 0 || now - lastAuctionTimestamp >= 30 days, "colony-auction-start-too-soon");
    address clny = IColony(metaColony).getToken();
    DutchAuction auction = new DutchAuction(clny, _token, metaColony);
    uint availableTokens = ERC20Extended(_token).balanceOf(this);
    ERC20Extended(_token).transfer(auction, availableTokens);
    auction.start();
    recentAuctions[_token] = now;
    emit AuctionCreated(address(auction), _token, availableTokens);
  }
}


contract DutchAuction is DSMath {
  address public colonyNetwork;
  address public metaColony;
  ERC20Extended public clnyToken;
  ERC20Extended public token;

  // Total number of auctioned tokens
  uint public quantity;
  bool public started;
  uint public startTime;
  uint public endTime;
  uint public minPrice;
  uint public constant TOKEN_MULTIPLIER = 10 ** 18;

  // Keep track of all CLNY wei received
  uint public receivedTotal;
  uint public bidCount;
  uint public claimCount;

  // Final price in CLNY per 10**18 Tokens (min 1, max 1e18)
  uint public finalPrice;
  bool public finalized;

  mapping (address => uint256) public bids;

  modifier auctionNotStarted {
    require(startTime == 0, "colony-auction-already-started");
    require(!started, "colony-auction-already-started");
    _;
  }

  modifier auctionStartedAndOpen {
    require(started, "colony-auction-not-started");
    require(startTime > 0, "colony-auction-not-started");
    require(endTime == 0, "colony-auction-closed");
    _;
  }

  modifier auctionClosed {
    require(endTime > 0, "colony-auction-not-closed");
    _;
  }

  modifier auctionNotFinalized() {
    require(!finalized, "colony-auction-already-finalized");
    _;
  }

  modifier auctionFinalized {
    require(finalized, "colony-auction-not-finalized");
    _;
  }

  modifier allBidsClaimed  {
    require(claimCount == bidCount, "colony-auction-not-all-bids-claimed");
    _;
  }

  event AuctionBid(address indexed _sender, uint _amount, uint _missingFunds);
  event AuctionClaim(address indexed _recipient, uint _sentAmount);
  event AuctionFinalized(uint _finalPrice);

  constructor(address _clnyToken, address _token, address _metaColony) public {
    colonyNetwork = msg.sender;
    metaColony = _metaColony;
    require(_clnyToken != 0x0 && _token != 0x0, "colony-auction-invalid-token");
    assert(_token != _clnyToken);
    clnyToken = ERC20Extended(_clnyToken);
    token = ERC20Extended(_token);
  }

  function start() public
  auctionNotStarted
  {
    quantity = token.balanceOf(this);
    assert(quantity > 0);

    // Set the minimum price as such that it doesn't cause the finalPrice to be 0
    minPrice = (quantity >= TOKEN_MULTIPLIER) ? 1 : TOKEN_MULTIPLIER / quantity;

    startTime = now;
    started = true;
  }

  function totalToEndAuction() public view
  auctionStartedAndOpen
  returns (uint)
  {
    return mul(quantity, price()) / TOKEN_MULTIPLIER;
  }

  // Get the price in CLNY per 10**18 Tokens (min 1 max 1e36)
  // Starting price is 10**36, after 1 day price is 10**35, after 2 days price is 10**34 and so on
  function price() public view
  auctionStartedAndOpen
  returns (uint)
  {
    uint duration = sub(now, startTime);
    uint daysOpen = duration / 86400;
    uint r = duration % 86400;
    uint p = mul(10**sub(36, daysOpen), sub(864000, mul(9,r))) / 864000;
    p = p < minPrice ? minPrice : p;
    return p;
  }

  function bid(uint256 _amount) public
  auctionStartedAndOpen
  {
    require(_amount > 0, "colony-auction-invalid-bid");
    uint _totalToEndAuction = totalToEndAuction();
    uint remainingToEndAuction = sub(_totalToEndAuction, receivedTotal);

    // Adjust the amount for final bid in case that takes us over the offered quantity at current price
    // Also conditionally set the auction endTime
    uint amount;
    if (remainingToEndAuction > _amount) {
      amount = _amount;
    } else {
      amount = remainingToEndAuction;
      endTime = now;
    }

    if (bids[msg.sender] == 0) {
      bidCount += 1;
    }

    clnyToken.transferFrom(msg.sender, this, amount);
    bids[msg.sender] = add(bids[msg.sender], amount);
    receivedTotal = add(receivedTotal, amount);

    emit AuctionBid(msg.sender, amount, sub(remainingToEndAuction, amount));
  }

  // Finalize the auction and set the final Token price
  function finalize() public
  auctionClosed
  auctionNotFinalized
  {
    // Give the metacolony all CLNY sent to the auction in bids
    clnyToken.transfer(metaColony, receivedTotal);
    finalPrice = add((mul(receivedTotal, TOKEN_MULTIPLIER) / quantity), 1);
    finalized = true;
    emit AuctionFinalized(finalPrice);
  }

  function claim() public
  auctionFinalized
  returns (bool)
  {
    uint amount = bids[msg.sender];
    require(amount > 0, "colony-auction-zero-bid-total");

    uint tokens = mul(amount, TOKEN_MULTIPLIER) / finalPrice;
    claimCount += 1;

    // Set receiver bid to 0 before transferring the tokens
    bids[msg.sender] = 0;
    uint beforeClaimBalance = token.balanceOf(msg.sender);
    require(token.transfer(msg.sender, tokens), "colony-auction-transfer-failed");
    assert(token.balanceOf(msg.sender) == add(beforeClaimBalance, tokens));
    assert(bids[msg.sender] == 0);

    emit AuctionClaim(msg.sender, tokens);
    return true;
  }

  function destruct() public
  auctionFinalized
  allBidsClaimed
  {
    // Transfer token remainder to the network
    uint auctionTokenBalance = token.balanceOf(this);
    token.transfer(colonyNetwork, auctionTokenBalance);
    // Check this contract balances in the working tokens is 0 before we kill it
    assert(clnyToken.balanceOf(this) == 0);
    assert(token.balanceOf(this) == 0);
    selfdestruct(colonyNetwork);
  }
}
