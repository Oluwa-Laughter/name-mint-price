// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Diamond} from "../src/diamond/Diamond.sol";
import {DiamondInit} from "../src/diamond/DiamondInit.sol";
import {DiamondDeployment} from "../src/diamond/DiamondDeployment.sol";
import {NFTFacet} from "../src/diamond/facets/NFTFacet.sol";
import {PriceFeedFacet} from "../src/diamond/facets/PriceFeedFacet.sol";
import {FileRegistryFacet} from "../src/diamond/facets/FileRegistryFacet.sol";
import {OwnershipFacet} from "../src/diamond/facets/OwnershipFacet.sol";
import {IDiamondCut} from "../src/diamond/interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "../src/diamond/interfaces/IDiamondLoupe.sol";
import {LibAppStorage} from "../src/diamond/libraries/LibAppStorage.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract NFTFacetV2 is NFTFacet {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract RevertingInit {
    function init() external pure {
        revert("upgrade initialization failed");
    }
}

contract ReentrantReceiver is IERC721Receiver {
    NFTFacet private target;
    bool public reentryBlocked;

    constructor(NFTFacet nft) {
        target = nft;
    }

    function onERC721Received(address, address, uint256 id, bytes calldata) external returns (bytes4) {
        require(bytes(target.tokenURI(id)).length > 0, "missing callback metadata");
        try target.mint{value: target.mintFee()}(address(this), "ipfs://meta", "ipfs://image") {}
        catch {
            reentryBlocked = true;
        }
        return this.onERC721Received.selector;
    }
}

contract DiamondTest is Test {
    Diamond internal diamond;
    NFTFacet internal nft;
    PriceFeedFacet internal price;
    FileRegistryFacet internal registry;
    MockV3Aggregator internal feed;
    DiamondInit internal initializer;
    address internal alice = address(0xA11CE);
    address payable internal treasury = payable(address(0xBEEF));
    uint256 internal constant FEE = 1000;

    function setUp() public {
        vm.warp(100_000);
        feed = new MockV3Aggregator(8);
        feed.setRound(1, 2000e8, block.timestamp);
        initializer = new DiamondInit();
        diamond = new Diamond(
            address(this),
            DiamondDeployment.deployFacets(),
            address(initializer),
            abi.encodeCall(DiamondInit.initialize, (treasury, FEE, address(feed), 7200))
        );
        nft = NFTFacet(address(diamond));
        price = PriceFeedFacet(address(diamond));
        registry = FileRegistryFacet(address(diamond));
        vm.deal(address(this), 10 ether);
        vm.deal(alice, 10 ether);
    }

    function cut(
        address facet,
        IDiamondCut.FacetCutAction action,
        bytes4[] memory selectors,
        address init,
        bytes memory data
    ) internal {
        IDiamondCut.FacetCut[] memory cuts = new IDiamondCut.FacetCut[](1);
        cuts[0] = IDiamondCut.FacetCut(facet, action, selectors);
        IDiamondCut(address(diamond)).diamondCut(cuts, init, data);
    }

    function one(bytes4 selector) internal pure returns (bytes4[] memory selectors) {
        selectors = new bytes4[](1);
        selectors[0] = selector;
    }

    function mintToAlice() internal {
        nft.mint{value: FEE}(alice, "ipfs://metadata", "ipfs://image");
    }

    function test_InitializationAndInterfaces() public view {
        assertEq(OwnershipFacet(address(diamond)).owner(), address(this));
        assertEq(nft.name(), "Name & Mint");
        assertEq(nft.symbol(), "NMINT");
        assertEq(nft.mintFee(), FEE);
        assertEq(nft.treasury(), treasury);
        assertEq(address(price.feed()), address(feed));
        assertEq(price.maxPriceAge(), 7200);
        assertTrue(nft.supportsInterface(0x80ac58cd));
        assertTrue(nft.supportsInterface(type(IDiamondCut).interfaceId));
        assertTrue(nft.supportsInterface(type(IDiamondLoupe).interfaceId));
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_LoupeEverySelectorMapsToExactlyOneFacet() public view {
        IDiamondLoupe.Facet[] memory facets = IDiamondLoupe(address(diamond)).facets();
        assertEq(facets.length, 6);
        uint256 count;
        for (uint256 i; i < facets.length; ++i) {
            bytes4[] memory selectors = IDiamondLoupe(address(diamond)).facetFunctionSelectors(facets[i].facetAddress);
            assertEq(selectors.length, facets[i].functionSelectors.length);
            for (uint256 j; j < selectors.length; ++j) {
                assertEq(IDiamondLoupe(address(diamond)).facetAddress(selectors[j]), facets[i].facetAddress);
                ++count;
            }
        }
        assertEq(count, 37);
    }

    function test_MintAndGalleryUseDiamondAddress() public {
        mintToAlice();
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.totalSupply(), 1);
        assertEq(nft.tokenURI(1), "ipfs://metadata");
        (NFTFacet.GalleryItem[] memory items, uint256 next) = nft.getTokens(0, 10);
        assertEq(next, 1);
        assertEq(items[0].creator, address(this));
        assertEq(items[0].valueWei, FEE);
        assertEq(address(diamond).balance, FEE);
    }

    function test_UpgradePreservesAllApplicationState() public {
        mintToAlice();
        vm.prank(alice);
        nft.approve(address(0x1234), 1);
        registry.registerFile("ipfs://document");
        address old = IDiamondLoupe(address(diamond)).facetAddress(NFTFacet.mint.selector);
        bytes4[] memory selectors = IDiamondLoupe(address(diamond)).facetFunctionSelectors(old);
        NFTFacetV2 replacement = new NFTFacetV2();
        cut(address(replacement), IDiamondCut.FacetCutAction.Replace, selectors, address(0), "");
        cut(address(replacement), IDiamondCut.FacetCutAction.Add, one(NFTFacetV2.version.selector), address(0), "");
        assertEq(NFTFacetV2(address(diamond)).version(), 2);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.getApproved(1), address(0x1234));
        assertEq(nft.tokenURI(1), "ipfs://metadata");
        assertEq(nft.mintRecord(1).valueWei, FEE);
        assertEq(nft.totalSupply(), 1);
        assertEq(nft.treasury(), treasury);
        assertEq(nft.mintFee(), FEE);
        assertEq(registry.getFile(1).uri, "ipfs://document");
        (uint256 usd,) = price.getEthUsdValue(1 ether);
        assertEq(usd, 2000e18);
        assertEq(address(diamond).balance, FEE);
        mintToAlice();
        assertEq(nft.totalSupply(), 2);
        assertEq(IDiamondLoupe(address(diamond)).facetFunctionSelectors(old).length, 0);
    }

    function test_NonOwnerCannotCutOrTransferOwnership() public {
        IDiamondCut.FacetCut[] memory empty = new IDiamondCut.FacetCut[](0);
        vm.prank(alice);
        vm.expectRevert();
        IDiamondCut(address(diamond)).diamondCut(empty, address(0), "");
        vm.prank(alice);
        vm.expectRevert();
        OwnershipFacet(address(diamond)).transferOwnership(alice);
    }

    function test_OwnershipTransferChangesUpgradeAuthority() public {
        OwnershipFacet(address(diamond)).transferOwnership(alice);
        assertEq(OwnershipFacet(address(diamond)).owner(), alice);
        vm.expectRevert();
        OwnershipFacet(address(diamond)).transferOwnership(address(this));
        vm.prank(alice);
        OwnershipFacet(address(diamond)).transferOwnership(address(this));
    }

    function test_CutEmitsChangeFromDiamondAddress() public {
        NFTFacetV2 v2 = new NFTFacetV2();
        vm.recordLogs();
        cut(address(v2), IDiamondCut.FacetCutAction.Add, one(v2.version.selector), address(0), "");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(diamond));
        assertEq(logs[0].topics[0], keccak256("DiamondCut((address,uint8,bytes4[])[],address,bytes)"));
    }

    function test_ZeroOwnerRejected() public {
        vm.expectRevert();
        OwnershipFacet(address(diamond)).transferOwnership(address(0));
        IDiamondCut.FacetCut[] memory empty = new IDiamondCut.FacetCut[](0);
        vm.expectRevert();
        new Diamond(address(0), empty, address(0), "");
    }

    function test_RemoveFunctionAndLoupeConsistency() public {
        NFTFacetV2 v2 = new NFTFacetV2();
        cut(address(v2), IDiamondCut.FacetCutAction.Add, one(v2.version.selector), address(0), "");
        cut(address(0), IDiamondCut.FacetCutAction.Remove, one(v2.version.selector), address(0), "");
        assertEq(IDiamondLoupe(address(diamond)).facetAddress(v2.version.selector), address(0));
        assertEq(IDiamondLoupe(address(diamond)).facetFunctionSelectors(address(v2)).length, 0);
        vm.expectRevert();
        NFTFacetV2(address(diamond)).version();
    }

    function test_DuplicateAddAndMissingReplaceRejected() public {
        NFTFacetV2 v2 = new NFTFacetV2();
        vm.expectRevert();
        cut(address(v2), IDiamondCut.FacetCutAction.Add, one(NFTFacet.mint.selector), address(0), "");
        vm.expectRevert();
        cut(address(v2), IDiamondCut.FacetCutAction.Replace, one(v2.version.selector), address(0), "");
    }

    function test_InvalidFacetAndInitTargetsRejected() public {
        vm.expectRevert();
        cut(alice, IDiamondCut.FacetCutAction.Add, one(bytes4(0x12345678)), address(0), "");
        IDiamondCut.FacetCut[] memory empty = new IDiamondCut.FacetCut[](0);
        vm.expectRevert();
        IDiamondCut(address(diamond)).diamondCut(empty, alice, hex"12345678");
        vm.expectRevert();
        IDiamondCut(address(diamond)).diamondCut(empty, address(0), hex"12345678");
    }

    function test_FailingUpgradeInitRollsBackSelectorChanges() public {
        NFTFacetV2 v2 = new NFTFacetV2();
        RevertingInit bad = new RevertingInit();
        vm.expectRevert(bytes("upgrade initialization failed"));
        cut(
            address(v2),
            IDiamondCut.FacetCutAction.Add,
            one(v2.version.selector),
            address(bad),
            abi.encodeCall(bad.init, ())
        );
        assertEq(IDiamondLoupe(address(diamond)).facetAddress(v2.version.selector), address(0));
    }

    function test_InitializersCannotBeCalledAgainOrOnImplementation() public {
        vm.expectRevert();
        initializer.initialize(treasury, FEE, address(feed), 7200);
        vm.expectRevert();
        DiamondInit(address(diamond)).initialize(treasury, FEE, address(feed), 7200);
        cut(address(initializer), IDiamondCut.FacetCutAction.Add, one(DiamondInit.initialize.selector), address(0), "");
        vm.expectRevert();
        DiamondInit(address(diamond)).initialize(treasury, FEE, address(feed), 7200);
    }

    function test_PriceStalenessAndRegistryIsolation() public {
        registry.registerFile("ipfs://doc");
        assertEq(registry.fileCount(), 1);
        assertEq(nft.totalSupply(), 0);
        vm.warp(block.timestamp + 7201);
        assertTrue(price.latestPrice().stale);
        vm.expectRevert();
        price.getEthUsdValue(1 ether);
    }

    function test_OnlyConfiguredTreasuryReceivesWithdrawals() public {
        mintToAlice();
        vm.prank(alice);
        nft.withdraw();
        assertEq(treasury.balance, FEE);
        assertEq(address(diamond).balance, 0);
    }

    function test_IncorrectFeeAndInvalidURIRevertAtomically() public {
        vm.expectRevert();
        nft.mint(alice, "ipfs://meta", "ipfs://image");
        vm.expectRevert();
        nft.mint{value: FEE}(alice, "https://bad", "ipfs://image");
        assertEq(nft.totalSupply(), 0);
        assertEq(address(diamond).balance, 0);
    }

    function test_ERC721ReceiverReentryCannotCreateExtraToken() public {
        ReentrantReceiver receiver = new ReentrantReceiver(nft);
        vm.deal(address(receiver), FEE);
        nft.mint{value: FEE}(address(receiver), "ipfs://meta", "ipfs://image");
        assertTrue(receiver.reentryBlocked());
        assertEq(nft.totalSupply(), 1);
    }

    function testFuzz_TransfersPreserveOwnershipAndBalances(address to) public {
        vm.assume(to != address(0) && to != alice && to != address(diamond));
        mintToAlice();
        vm.prank(alice);
        nft.transferFrom(alice, to, 1);
        assertEq(nft.ownerOf(1), to);
        assertEq(nft.balanceOf(alice), 0);
        assertEq(nft.balanceOf(to), 1);
        assertEq(nft.mintRecord(1).creator, address(this));
    }
}
