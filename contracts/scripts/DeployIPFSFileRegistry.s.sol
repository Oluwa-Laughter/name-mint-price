// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IPFSFileRegistry} from "../src/IPFSFileRegistry.sol";

contract DeployIPFSFileRegistry is Script {
    function run() external returns (IPFSFileRegistry registry) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Use Sepolia or local Anvil");
        vm.startBroadcast();
        registry = new IPFSFileRegistry();
        vm.stopBroadcast();
    }
}
