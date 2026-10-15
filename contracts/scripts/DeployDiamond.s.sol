// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {Diamond} from "../src/diamond/Diamond.sol";
import {DiamondInit} from "../src/diamond/DiamondInit.sol";
import {DiamondDeployment} from "../src/diamond/DiamondDeployment.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";

contract DeployDiamond is Script {
    event DiamondDeployed(address indexed diamond, address indexed owner, address initializer);

    function run() external returns (Diamond diamond) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Use Sepolia or local Anvil");
        address owner = vm.envAddress("DIAMOND_OWNER");
        address payable treasury = payable(vm.envAddress("TREASURY_ADDRESS"));
        uint256 fee = vm.envOr("MINT_FEE_WEI", uint256(0));
        uint256 age = vm.envOr("MAX_PRICE_AGE_SECONDS", uint256(7200));
        address feed = block.chainid == 11155111
            ? 0x694AA1769357215DE4FAC081bf1f309aDC325306
            : vm.envAddress("LOCAL_PRICE_FEED_ADDRESS");
        vm.startBroadcast();
        IDiamondCut.FacetCut[] memory cuts = DiamondDeployment.deployFacets();
        DiamondInit init = new DiamondInit();
        diamond =
            new Diamond(owner, cuts, address(init), abi.encodeCall(DiamondInit.initialize, (treasury, fee, feed, age)));
        vm.stopBroadcast();
        emit DiamondDeployed(address(diamond), owner, address(init));
    }
}
