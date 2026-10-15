// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UpgradeDiamond} from "../scripts/UpgradeDiamond.s.sol";

contract UpgradeDiamondHarness is UpgradeDiamond {
    function parse(bytes[] memory encoded) external pure returns (bytes4[] memory) {
        return _parseSelectors(encoded);
    }
}

contract UpgradeDiamondScriptTest is Test {
    UpgradeDiamondHarness internal script;

    function setUp() public {
        script = new UpgradeDiamondHarness();
    }

    function test_ParsesExactSelectorsWithoutPaddingOrTruncation() public view {
        bytes[] memory encoded = new bytes[](2);
        encoded[0] = hex"12345678";
        encoded[1] = hex"00000001";
        bytes4[] memory selectors = script.parse(encoded);
        assertEq(selectors.length, 2);
        assertEq(selectors[0], bytes4(0x12345678));
        assertEq(selectors[1], bytes4(0x00000001));
    }

    function test_RejectsAnEmptyList() public {
        bytes[] memory encoded = new bytes[](0);
        vm.expectRevert(bytes("Review selectors before broadcasting"));
        script.parse(encoded);
    }

    function testFuzz_RejectsSelectorsWithWrongByteLength(uint8 length) public {
        vm.assume(length != 4);
        bytes[] memory encoded = new bytes[](1);
        encoded[0] = new bytes(length);
        vm.expectRevert(bytes("Each selector must be exactly 4 bytes"));
        script.parse(encoded);
    }
}
