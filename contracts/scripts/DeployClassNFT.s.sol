// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ClassNFT} from "../src/ClassNFT.sol";

contract DeployClassNFT is Script {
    function run() external returns (ClassNFT nft) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Use Sepolia or local Anvil");
        address payable treasury = payable(vm.envAddress("TREASURY_ADDRESS"));
        uint256 mintFee = vm.envOr("MINT_FEE_WEI", uint256(0));
        vm.startBroadcast();
        nft = new ClassNFT(treasury, mintFee);
        vm.stopBroadcast();
    }
}
