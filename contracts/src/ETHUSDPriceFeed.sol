// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @notice Read-only ETH/USD consumer. Reads Chainlink on every call; no upkeep transaction is needed.
/// @dev The deployer must select the ETH/USD proxy for the target network.
contract ETHUSDPriceFeed {
    error InvalidFeed();
    error InvalidMaxPriceAge();
    error UnsupportedDecimals(uint8 decimals);
    error InvalidPrice();
    error StalePrice(uint256 updatedAt, uint256 maxPriceAge);

    struct PriceData {
        uint80 roundId;
        int256 answer;
        uint8 decimals;
        uint256 updatedAt;
        uint256 age;
        bool valid;
        bool stale;
    }

    AggregatorV3Interface public immutable feed;
    uint256 public immutable maxPriceAge;

    constructor(address feed_, uint256 maxPriceAge_) {
        if (feed_.code.length == 0) revert InvalidFeed();
        if (maxPriceAge_ == 0) revert InvalidMaxPriceAge();
        feed = AggregatorV3Interface(feed_);
        maxPriceAge = maxPriceAge_;
        uint8 decimals_ = feed.decimals();
        if (decimals_ > 18) revert UnsupportedDecimals(decimals_);
    }

    /// @notice Returns the raw answer and status, including stale data for an honest age display.
    /// @dev Upstream RPC/feed errors propagate. `valid` checks shape; `stale` also checks age.
    ///      answeredInRound is deprecated by Chainlink and is intentionally not used.
    function latestPrice() public view returns (PriceData memory price) {
        (uint80 roundId, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        uint8 decimals_ = feed.decimals();
        price.roundId = roundId;
        price.answer = answer;
        price.decimals = decimals_;
        price.updatedAt = updatedAt;
        price.valid = roundId != 0 && answer > 0 && updatedAt != 0 && updatedAt <= block.timestamp && decimals_ <= 18;
        if (updatedAt != 0 && updatedAt <= block.timestamp) price.age = block.timestamp - updatedAt;
        price.stale = !price.valid || price.age > maxPriceAge;
    }

    /// @notice Convert wei to USD with 18 decimals, rounded down, using a valid fresh quote.
    /// @dev E.g. at $2,000/ETH, 1 ether returns 2000 * 1e18. This is not an NFT appraisal.
    function getEthUsdValue(uint256 weiAmount) external view returns (uint256 usdValue18, uint256 updatedAt) {
        PriceData memory price = latestPrice();
        if (!price.valid) revert InvalidPrice();
        if (price.stale) revert StalePrice(price.updatedAt, maxPriceAge);
        usdValue18 = Math.mulDiv(weiAmount, uint256(price.answer), 10 ** uint256(price.decimals));
        updatedAt = price.updatedAt;
    }
}
