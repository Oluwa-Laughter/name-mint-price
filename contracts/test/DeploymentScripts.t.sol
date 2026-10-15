// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployClassNFT} from "../scripts/DeployClassNFT.s.sol";
import {DeployIPFSFileRegistry} from "../scripts/DeployIPFSFileRegistry.s.sol";
import {DeployETHUSDPriceFeed} from "../scripts/DeployETHUSDPriceFeed.s.sol";
import {ClassNFT} from "../src/ClassNFT.sol";
import {IPFSFileRegistry} from "../src/IPFSFileRegistry.sol";
import {ETHUSDPriceFeed} from "../src/ETHUSDPriceFeed.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";

contract DeploymentScriptsTest is Test {
    address internal constant SEPOLIA_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    function test_NFTScriptUsesConfiguredTreasuryAndFee() public {
        vm.chainId(11155111);
        vm.setEnv("TREASURY_ADDRESS", "0x1111111111111111111111111111111111111111");
        vm.setEnv("MINT_FEE_WEI", "1000");
        ClassNFT nft = (new DeployClassNFT()).run();
        assertEq(nft.treasury(), 0x1111111111111111111111111111111111111111);
        assertEq(nft.mintFee(), 1000);
    }

    function test_RegistryScriptDeploysEmptyRegistry() public {
        vm.chainId(11155111);
        IPFSFileRegistry registry = (new DeployIPFSFileRegistry()).run();
        assertEq(registry.fileCount(), 0);
    }

    function test_PriceScriptUsesOfficialSepoliaProxy() public {
        vm.chainId(11155111);
        // Stub the proxy in this unit test; no external network request is made.
        vm.etch(SEPOLIA_FEED, hex"00");
        vm.mockCall(SEPOLIA_FEED, abi.encodeWithSignature("decimals()"), abi.encode(uint8(8)));
        vm.setEnv("MAX_PRICE_AGE_SECONDS", "7200");
        ETHUSDPriceFeed consumer = (new DeployETHUSDPriceFeed()).run();
        assertEq(address(consumer.feed()), SEPOLIA_FEED);
        assertEq(consumer.maxPriceAge(), 7200);
    }

    function test_LocalPriceScriptUsesExplicitMockAddress() public {
        vm.chainId(31337);
        MockV3Aggregator mock = new MockV3Aggregator(8);
        vm.setEnv("LOCAL_PRICE_FEED_ADDRESS", vm.toString(address(mock)));
        vm.setEnv("MAX_PRICE_AGE_SECONDS", "600");
        ETHUSDPriceFeed consumer = (new DeployETHUSDPriceFeed()).run();
        assertEq(address(consumer.feed()), address(mock));
        assertEq(consumer.maxPriceAge(), 600);
    }

    function test_AllScriptsRejectOtherNetworks() public {
        vm.chainId(1);
        DeployClassNFT nftScript = new DeployClassNFT();
        DeployIPFSFileRegistry registryScript = new DeployIPFSFileRegistry();
        DeployETHUSDPriceFeed priceScript = new DeployETHUSDPriceFeed();
        vm.expectRevert(bytes("Use Sepolia or local Anvil"));
        nftScript.run();
        vm.expectRevert(bytes("Use Sepolia or local Anvil"));
        registryScript.run();
        vm.expectRevert(bytes("Use Sepolia or local Anvil"));
        priceScript.run();
    }
}
