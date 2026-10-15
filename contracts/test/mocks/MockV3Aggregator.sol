// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

/// @dev Test-only feed; never deploy as a substitute for Chainlink on Sepolia.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public decimals;
    uint80 public roundId = 1;
    int256 public answer;
    uint256 public updatedAt;
    bool public unavailable;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function setRound(uint80 roundId_, int256 answer_, uint256 updatedAt_) external {
        roundId = roundId_;
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function setDecimals(uint8 decimals_) external {
        decimals = decimals_;
    }

    function setUnavailable(bool unavailable_) external {
        unavailable = unavailable_;
    }

    function description() external pure returns (string memory) {
        return "ETH / USD";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function latestRoundData() public view returns (uint80, int256, uint256, uint256, uint80) {
        require(!unavailable, "No data present");
        return (roundId, answer, updatedAt, updatedAt, roundId);
    }

    function getRoundData(uint80) external view returns (uint80, int256, uint256, uint256, uint80) {
        return latestRoundData();
    }
}
