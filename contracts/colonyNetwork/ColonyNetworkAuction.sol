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

import "./ColonyNetworkStorage.sol";
import "./../common/MultiChain.sol";
import "./../common/BasicMetaTransaction.sol";

contract ColonyNetworkAuction is ColonyNetworkStorage, MultiChain {
  function startTokenAuction(address _token) public
  stoppable
  auth
  {
    require(_token != address(0x0), "colony-auction-invalid-token");

    uint lastAuctionTimestamp = recentAuctions[_token];
    require(lastAuctionTimestamp == 0 || block.timestamp - lastAuctionTimestamp >= 30 days, "colony-auction-start-too-soon");

    address clny = IMetaColony(metaColony).getToken();
    require(clny != address(0x0), "colony-auction-invalid-clny-token");

    uint availableTokens = ERC20Extended(_token).balanceOf(address(this));

    if (_token==clny) {
      // We don't auction CLNY. We just burn it instead.
      // Note we can do this more often than every 30 days.
      if (isXdai()){
        // On Xdai, we can't burn bridged tokens
        // so let's send them to the metacolony for now.
        require(ERC20Extended(clny).transfer(metaColony, availableTokens), "colony-network-transfer-failed");
      } else {
        ERC20Extended(clny).burn(availableTokens);
      }
      return;
    }

    DutchAuction auction = new DutchAuction(clny, _token, metaColony);
    recentAuctions[_token] = block.timestamp;

    assert(ERC20Extended(_token).transfer(address(auction), availableTokens));
    auction.start();

    emit AuctionCreated(address(auction), _token, availableTokens);
  }
}


contract DutchAuction is DSMath, MultiChain, BasicMetaTransaction {
  address payable public colonyNetwork;
  address public metaColonyAddress;
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

  // Final price in CLNY per 10**18 Tokens (min 1, max 1e36)
  uint public finalPrice;
  bool public finalized;
  mapping(address => uint256) metatransactionNonces;

  mapping (address => uint256) public bids;

  modifier auctionNotStarted {
    // slither-disable-next-line incorrect-equality
    require(startTime == 0, "colony-auction-already-started");
    require(!started, "colony-auction-already-started");
    _;
  }

  modifier auctionStartedAndOpen {
    require(started, "colony-auction-not-started");
    require(startTime > 0, "colony-auction-not-started");
    // slither-disable-next-line incorrect-equality
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

  event AuctionStarted(address _token, uint256 _quantity, uint256 _minPrice);
  event AuctionBid(address indexed _sender, uint256 _amount, uint256 _missingFunds);
  event AuctionClaim(address indexed _recipient, uint256 _sentAmount);
  event AuctionFinalized(uint256 _finalPrice);

  constructor(address _clnyToken, address _token, address _metaColonyAddress) public {
    require(_metaColonyAddress != address(0x0), "colony-auction-metacolony-cannot-be-zero");

    colonyNetwork = msgSender();
    metaColonyAddress = _metaColonyAddress;
    clnyToken = ERC20Extended(_clnyToken);
    token = ERC20Extended(_token);
  }

  function getMetatransactionNonce(address userAddress) override public view returns (uint256 nonce){
    return metatransactionNonces[userAddress];
  }

  function incrementMetatransactionNonce(address user) override internal {
    metatransactionNonces[user] = add(metatransactionNonces[user], 1);
  }

  function start() public
  auctionNotStarted
  {
    quantity = token.balanceOf(address(this));
    assert(quantity > 0);

    // Set the minimum price as such that it doesn't cause the finalPrice to be 0
    minPrice = (quantity >= TOKEN_MULTIPLIER) ? 1 : TOKEN_MULTIPLIER / quantity;

    startTime = block.timestamp;
    started = true;

    emit AuctionStarted(address(token), quantity, minPrice);
  }

  function remainingToEndAuction() public view
  auctionStartedAndOpen
  returns (uint256)
  {
    // Total amount to end the auction at the current price
    uint totalToEndAuctionAtCurrentPrice;
    // For low quantity auctions, there are cases where q * p < 1e18 once price has decreased sufficiently
    if (quantity < TOKEN_MULTIPLIER && price() == minPrice) {
      totalToEndAuctionAtCurrentPrice = 1;
    } else {
      totalToEndAuctionAtCurrentPrice = mul(quantity, price()) / TOKEN_MULTIPLIER;
    }

    uint _remainingToEndAuction = 0;
    if (totalToEndAuctionAtCurrentPrice > receivedTotal) {
      _remainingToEndAuction = sub(totalToEndAuctionAtCurrentPrice, receivedTotal);
    }

    return _remainingToEndAuction;
  }

  // Get the price in CLNY per 10**18 Tokens (min 1 max 1e36)
  // Starting price is 10**36, after 1 day price is 10**35, after 2 days price is 10**34 and so on
  function price() public view
  auctionStartedAndOpen
  returns (uint256)
  {
    uint duration = sub(block.timestamp, startTime);
    uint daysOpen = duration / 86400;
    if (daysOpen > 36) {
      return minPrice;
    }
    uint r = duration % 86400;

    uint x = mul(10**sub(36, daysOpen), sub(864000, mul(9,r))) / 864000;
    uint p = x < minPrice ? minPrice : x;
    return p;
  }

  function bid(uint256 _amount) public
  auctionStartedAndOpen
  {
    // Adjust the amount for final bid in case that takes us over the offered quantity at current price
    require(_amount > 0, "colony-auction-invalid-bid");
    uint _remainingToEndAuction = remainingToEndAuction();
    // Also conditionally set the auction endTime
    uint amount;
    if (_remainingToEndAuction > _amount) {
      amount = _amount;
    } else if (_remainingToEndAuction != 0) {
      // Required amount left to end the auction is less than the bid, so adjust bid amount down to the required quantity only and close the auction
      amount = _remainingToEndAuction;
      endTime = block.timestamp;
    } else {
      // We've received sufficient quantity to end the auction so just close the auction and return
      endTime = block.timestamp;
      return;
    }

    if (bids[msgSender()] == 0) {
      bidCount += 1;
    }

    bids[msgSender()] = add(bids[msgSender()], amount);
    receivedTotal = add(receivedTotal, amount);

    require(clnyToken.transferFrom(msgSender(), address(this), amount), "colony-auction-bid-transfer-failed");

    emit AuctionBid(msgSender(), amount, sub(_remainingToEndAuction, amount));
  }

  // Finalize the auction and set the final Token price
  function finalize() public
  auctionClosed
  auctionNotFinalized
  {
    finalPrice = mul(receivedTotal, TOKEN_MULTIPLIER) / quantity;
    finalPrice = finalPrice <= minPrice ? minPrice : finalPrice;
    assert(finalPrice != 0);

    finalized = true;

    // Burn all CLNY received
    if (isXdai()){
      // On Xdai, we can't burn bridged tokens
      // so let's send them to the metacolony for now.
      require(clnyToken.transfer(metaColonyAddress, receivedTotal), "colony-network-transfer-failed");
    } else {
      clnyToken.burn(receivedTotal);
    }
    emit AuctionFinalized(finalPrice);
  }

  function claim(address recipient) public
  auctionFinalized
  returns (bool)
  {
    uint amount = bids[recipient];
    require(amount > 0, "colony-auction-zero-bid-total");

    uint tokens;
    if (mul(amount, quantity) < receivedTotal) {
      tokens = mul(amount, TOKEN_MULTIPLIER) / finalPrice;
    } else {
      // To avoid inaccuracies we substitute finalPrice = mul(receivedTotal, TOKEN_MULTIPLIER) / quantity
      // in the above claim calculation tokens = mul(amount, TOKEN_MULTIPLIER) / finalPrice;
      // deriving the calculation below instead, which avoids using finaPrice altogether.
      tokens = mul(amount, quantity) / receivedTotal;
    }

    claimCount += 1;

    // Set receiver bid to 0 before transferring the tokens
    bids[recipient] = 0;
    uint beforeClaimBalance = token.balanceOf(recipient);
    assert(token.transfer(recipient, tokens));
    // slither-disable-next-line incorrect-equality
    assert(token.balanceOf(recipient) == add(beforeClaimBalance, tokens));
    assert(bids[recipient] == 0);

    emit AuctionClaim(recipient, tokens);
    return true;
  }

  // slither-disable-next-line suicidal
  function destruct() public
  auctionFinalized
  allBidsClaimed
  {
    // Transfer token remainder to the network
    uint auctionTokenBalance = token.balanceOf(address(this));
    assert(token.transfer(colonyNetwork, auctionTokenBalance));
    // Transfer CLNY remainder to the meta colony. There shouldn't be any left at this point but just in case..
    uint auctionClnyBalance = clnyToken.balanceOf(address(this));
    assert(clnyToken.transfer(metaColonyAddress, auctionClnyBalance));
    // Check this contract balances in the working tokens is 0 before we kill it
    // slither-disable-next-line incorrect-equality
    assert(clnyToken.balanceOf(address(this)) == 0);
    // slither-disable-next-line incorrect-equality
    assert(token.balanceOf(address(this)) == 0);
    selfdestruct(colonyNetwork);
  }
}
