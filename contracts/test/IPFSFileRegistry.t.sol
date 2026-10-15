// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPFSFileRegistry} from "../src/IPFSFileRegistry.sol";

contract IPFSFileRegistryTest is Test {
    IPFSFileRegistry internal registry;
    address internal alice;
    address internal bob;
    string internal constant URI = "ipfs://bafy-file/document.pdf";

    event FileRegistered(uint256 indexed fileId, address indexed uploader, string uri);

    function setUp() public {
        registry = new IPFSFileRegistry();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
    }

    function test_RegistersURIWithWalletTimestampAndEvent() public {
        vm.warp(100);
        vm.expectEmit(true, true, false, true, address(registry));
        emit FileRegistered(1, alice, URI);
        vm.prank(alice);
        uint256 id = registry.registerFile(URI);
        assertEq(id, 1);
        assertEq(registry.fileCount(), 1);
        IPFSFileRegistry.FileRecord memory file = registry.getFile(id);
        assertEq(file.fileId, id);
        assertEq(file.uploader, alice);
        assertEq(file.registeredAt, 100);
        assertEq(file.uri, URI);
    }

    function test_RejectsMalformedAndOversizeURIs() public {
        vm.expectRevert(IPFSFileRegistry.InvalidIPFSURI.selector);
        registry.registerFile("");
        vm.expectRevert(IPFSFileRegistry.InvalidIPFSURI.selector);
        registry.registerFile("ipfs://");
        vm.expectRevert(IPFSFileRegistry.InvalidIPFSURI.selector);
        registry.registerFile("https://example.com/file");
        vm.expectRevert(IPFSFileRegistry.InvalidIPFSURI.selector);
        registry.registerFile(string.concat("ipfs://", new string(506)));
        assertEq(registry.fileCount(), 0);
    }

    function test_SameFileCanBeRegisteredByDifferentWallets() public {
        vm.prank(alice);
        uint256 first = registry.registerFile(URI);
        vm.prank(bob);
        uint256 second = registry.registerFile(URI);
        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(registry.getFile(first).uploader, alice);
        assertEq(registry.getFile(second).uploader, bob);
    }

    function test_PaginatesFilesAndFinishesWithPartialPage() public {
        for (uint256 i; i < 3; ++i) {
            vm.prank(alice);
            registry.registerFile(URI);
        }
        (IPFSFileRegistry.FileRecord[] memory files, uint256 next) = registry.getFiles(0, 2);
        assertEq(files.length, 2);
        assertEq(files[0].fileId, 1);
        assertEq(files[1].fileId, 2);
        assertEq(next, 2);
        (files, next) = registry.getFiles(next, 2);
        assertEq(files.length, 1);
        assertEq(files[0].fileId, 3);
        assertEq(next, registry.fileCount());
        (files, next) = registry.getFiles(next, 2);
        assertEq(files.length, 0);
        assertEq(next, 3);
        (files, next) = registry.getFiles(type(uint256).max, 100);
        assertEq(files.length, 0);
        assertEq(next, 3);
    }

    function test_EmptyRegistryPage() public view {
        (IPFSFileRegistry.FileRecord[] memory files, uint256 next) = registry.getFiles(0, 100);
        assertEq(files.length, 0);
        assertEq(next, 0);
    }

    function test_RejectsMissingFilesAndUnboundedPages() public {
        vm.expectRevert(abi.encodeWithSelector(IPFSFileRegistry.FileNotFound.selector, uint256(0)));
        registry.getFile(0);
        vm.expectRevert(abi.encodeWithSelector(IPFSFileRegistry.FileNotFound.selector, uint256(1)));
        registry.getFile(1);
        vm.expectRevert(IPFSFileRegistry.InvalidPageSize.selector);
        registry.getFiles(0, 0);
        vm.expectRevert(IPFSFileRegistry.InvalidPageSize.selector);
        registry.getFiles(0, 101);
    }
}
