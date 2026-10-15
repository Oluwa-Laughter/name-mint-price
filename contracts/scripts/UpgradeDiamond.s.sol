// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../src/diamond/interfaces/IDiamondLoupe.sol";

/// @notice Submit one reviewed facet change through the Diamond owner's keystore.
/// @dev This does not deploy a replacement facet or choose selectors automatically.
contract UpgradeDiamond is Script {
    function run() external {
        require(block.chainid == 11155111 || block.chainid == 31337, "Use Sepolia or local Anvil");
        address diamond = vm.envAddress("DIAMOND_ADDRESS");
        require(diamond.code.length > 0, "Diamond has no code");
        uint256 action = vm.envUint("UPGRADE_ACTION");
        require(action <= 2, "Action must be Add=0, Replace=1 or Remove=2");
        address facet = vm.envAddress("UPGRADE_FACET_ADDRESS");
        bytes4[] memory selectors = vm.envBytes4("UPGRADE_SELECTORS", ",");
        require(selectors.length > 0, "Review selectors before broadcasting");
        address expectedOldFacet = vm.envAddress("UPGRADE_EXPECTED_OLD_FACET");
        for (uint256 i; i < selectors.length; ++i) {
            require(IDiamondLoupe(diamond).facetAddress(selectors[i]) == expectedOldFacet, "Facet mapping changed");
        }
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        cuts[0] = IDiamondCut.FacetCut(facet, IDiamondCut.FacetCutAction(action), selectors);
        address init = vm.envOr("UPGRADE_INIT_ADDRESS", address(0));
        bytes memory data = vm.envOr("UPGRADE_INIT_CALLDATA", bytes(""));
        vm.startBroadcast();
        IDiamondCut(diamond).diamondCut(cuts, init, data);
        vm.stopBroadcast();
    }
}
