// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ClassNFT} from "../src/ClassNFT.sol";

contract ClassNFTTest is Test {
    ClassNFT internal nft;
    address payable internal treasury = payable(makeAddr("treasury"));
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant FEE = 0.001 ether;
    string internal constant METADATA = "ipfs://bafy-metadata/profile.json";
    string internal constant IMAGE = "ipfs://bafy-image/avatar.png";

    function setUp() public {
        nft = new ClassNFT(treasury, FEE);
        vm.deal(alice, 10 ether);
    }

    function _mint(address recipient) internal returns (uint256) {
        vm.prank(alice);
        return nft.mint{value: FEE}(recipient, METADATA, IMAGE);
    }

    function test_MintStoresIPFSAndPaymentAndRecipient() public {
        vm.warp(1000);
        uint256 id = _mint(bob);
        assertEq(id, 1);
        assertEq(nft.ownerOf(id), bob);
        assertEq(nft.tokenURI(id), METADATA);
        assertEq(nft.totalSupply(), 1);
        ClassNFT.MintRecord memory record = nft.mintRecord(id);
        assertEq(record.creator, alice);
        assertEq(record.valueWei, FEE);
        assertEq(record.mintedAt, 1000);
        assertEq(record.imageURI, IMAGE);
        assertEq(address(nft).balance, FEE);
    }

    function test_FreeMint() public {
        ClassNFT free = new ClassNFT(treasury, 0);
        vm.prank(alice);
        free.mint(alice, METADATA, IMAGE);
        assertEq(free.ownerOf(1), alice);
        assertEq(free.mintRecord(1).valueWei, 0);
    }

    function testFuzz_RejectsIncorrectPayment(uint96 payment) public {
        vm.assume(payment != FEE);
        vm.deal(alice, payment);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClassNFT.IncorrectMintFee.selector, FEE, uint256(payment)));
        nft.mint{value: payment}(alice, METADATA, IMAGE);
    }

    function test_RejectsNonIPFSMetadata() public {
        vm.prank(alice);
        vm.expectRevert(ClassNFT.InvalidIPFSURI.selector);
        nft.mint{value: FEE}(alice, "https://example.com/metadata.json", IMAGE);
    }

    function test_RejectsNonIPFSImage() public {
        vm.prank(alice);
        vm.expectRevert(ClassNFT.InvalidIPFSURI.selector);
        nft.mint{value: FEE}(alice, METADATA, "https://example.com/image.png");
    }

    function test_RejectsEmptyIPFSAndOversizeURIs() public {
        vm.startPrank(alice);
        vm.expectRevert(ClassNFT.InvalidIPFSURI.selector);
        nft.mint{value: FEE}(alice, "ipfs://", IMAGE);
        vm.expectRevert(ClassNFT.InvalidIPFSURI.selector);
        nft.mint{value: FEE}(alice, string.concat("ipfs://", new string(506)), IMAGE);
        vm.stopPrank();
    }

    function test_RejectedRecipientRollsBackSupplyMetadataAndPayment() public {
        vm.prank(alice);
        vm.expectRevert();
        nft.mint{value: FEE}(address(0), METADATA, IMAGE);
        vm.prank(alice);
        vm.expectRevert();
        nft.mint{value: FEE}(address(this), METADATA, IMAGE);
        assertEq(nft.totalSupply(), 0);
        assertEq(address(nft).balance, 0);
    }

    function test_PaginationAndCurrentOwnersAfterTransfer() public {
        _mint(alice);
        _mint(alice);
        _mint(bob);
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        (ClassNFT.GalleryItem[] memory first, uint256 cursor) = nft.getTokens(0, 2);
        assertEq(first.length, 2);
        assertEq(cursor, 2);
        assertEq(first[0].tokenId, 1);
        assertEq(first[0].owner, bob);
        assertEq(first[0].creator, alice);
        assertEq(first[0].metadataURI, METADATA);
        assertEq(first[0].imageURI, IMAGE);
        assertEq(first[0].valueWei, FEE);
        (ClassNFT.GalleryItem[] memory last, uint256 end) = nft.getTokens(cursor, 2);
        assertEq(last.length, 1);
        assertEq(last[0].tokenId, 3);
        assertEq(end, nft.totalSupply());
    }

    function test_EmptyPagesAndLargeOffsetDoNotOverflow() public view {
        (ClassNFT.GalleryItem[] memory items, uint256 cursor) = nft.getTokens(type(uint256).max, 100);
        assertEq(items.length, 0);
        assertEq(cursor, 0);
    }

    function test_RejectsUnboundedPageSizes() public {
        vm.expectRevert(ClassNFT.InvalidPageSize.selector);
        nft.getTokens(0, 0);
        vm.expectRevert(ClassNFT.InvalidPageSize.selector);
        nft.getTokens(0, 101);
    }

    function test_RecordForMissingTokenReverts() public {
        vm.expectRevert();
        nft.mintRecord(1);
    }

    function test_AnyoneCanWithdrawOnlyToTreasury() public {
        _mint(alice);
        vm.prank(bob);
        nft.withdraw();
        assertEq(treasury.balance, FEE);
        assertEq(address(nft).balance, 0);
        assertEq(bob.balance, 0);
        vm.expectRevert(ClassNFT.NothingToWithdraw.selector);
        nft.withdraw();
    }

    function test_RejectsInvalidTreasury() public {
        vm.expectRevert(ClassNFT.InvalidTreasury.selector);
        new ClassNFT(payable(address(0)), FEE);
    }

    function test_FailedWithdrawalPreservesFunds() public {
        RejectEther rejecting = new RejectEther();
        ClassNFT other = new ClassNFT(payable(address(rejecting)), FEE);
        vm.prank(alice);
        other.mint{value: FEE}(alice, METADATA, IMAGE);
        vm.expectRevert(ClassNFT.WithdrawalFailed.selector);
        other.withdraw();
        assertEq(address(other).balance, FEE);
    }

    function test_ReceiverSeesCompleteMetadataAndCannotReenterMint() public {
        MintReceiver receiver = new MintReceiver(nft);
        vm.deal(address(receiver), FEE);
        _mint(address(receiver));
        assertTrue(receiver.sawMetadata());
        assertTrue(receiver.reentryBlocked());
        assertEq(nft.totalSupply(), 1);
    }

    function test_SupportsERC721MetadataAndERC4906() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd));
        assertTrue(nft.supportsInterface(0x5b5e139f));
        assertTrue(nft.supportsInterface(0x49064906));
    }
}

contract RejectEther {}

contract MintReceiver is IERC721Receiver {
    ClassNFT internal immutable nft;
    bool public sawMetadata;
    bool public reentryBlocked;

    constructor(ClassNFT nft_) {
        nft = nft_;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        require(msg.sender == address(nft));
        sawMetadata = bytes(nft.tokenURI(tokenId)).length > 0 && nft.mintRecord(tokenId).creator != address(0);
        try nft.mint{value: nft.mintFee()}(address(this), "ipfs://metadata", "ipfs://image") {
            reentryBlocked = false;
        } catch (bytes memory reason) {
            reentryBlocked = bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()"));
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}
