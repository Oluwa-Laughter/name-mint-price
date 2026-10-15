// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chainlink's standard data-feed proxy interface. This is not a deployable feed.
/// @dev Signatures follow https://docs.chain.link/data-feeds/api-reference.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}
