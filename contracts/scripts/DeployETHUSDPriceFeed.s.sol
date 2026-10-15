// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ETHUSDPriceFeed} from "../src/ETHUSDPriceFeed.sol";

contract DeployETHUSDPriceFeed is Script {
    address internal constant SEPOLIA_ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    function run() external returns (ETHUSDPriceFeed consumer) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Use Sepolia or local Anvil");
        // Local Anvil requires a mock feed address; Sepolia always uses the official ETH/USD proxy.
        address feed = block.chainid == 11155111 ? SEPOLIA_ETH_USD : vm.envAddress("LOCAL_PRICE_FEED_ADDRESS");
        uint256 maxAge = vm.envOr("MAX_PRICE_AGE_SECONDS", uint256(7200));
        vm.startBroadcast();
        consumer = new ETHUSDPriceFeed(feed, maxAge);
        vm.stopBroadcast();
    }
}
