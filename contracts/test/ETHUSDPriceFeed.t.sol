// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ETHUSDPriceFeed} from "../src/ETHUSDPriceFeed.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";

contract ETHUSDPriceFeedTest is Test {
    MockV3Aggregator internal feed;
    ETHUSDPriceFeed internal consumer;
    uint256 internal constant MAX_AGE = 7200;
    uint256 internal constant NOW = 100_000;

    function setUp() public {
        vm.warp(NOW);
        feed = new MockV3Aggregator(8);
        feed.setRound(5, 2000e8, NOW - 60);
        consumer = new ETHUSDPriceFeed(address(feed), MAX_AGE);
    }

    function test_ReturnsAnswerPrecisionAndActualAge() public view {
        ETHUSDPriceFeed.PriceData memory price = consumer.latestPrice();
        assertEq(price.roundId, 5);
        assertEq(price.answer, 2000e8);
        assertEq(price.decimals, 8);
        assertEq(price.updatedAt, NOW - 60);
        assertEq(price.age, 60);
        assertTrue(price.valid);
        assertFalse(price.stale);
    }

    function test_ConvertsMintPaymentBalanceAndZeroUsing18DecimalUSD() public view {
        (uint256 dollars, uint256 updatedAt) = consumer.getEthUsdValue(1 ether);
        assertEq(dollars, 2000e18);
        assertEq(updatedAt, NOW - 60);
        (uint256 mintDollars,) = consumer.getEthUsdValue(0.001 ether);
        assertEq(mintDollars, 2e18);
        (uint256 zero,) = consumer.getEthUsdValue(0);
        assertEq(zero, 0);
    }

    function test_NewFeedRoundAppearsWithoutConsumerWrite() public {
        feed.setRound(6, 2500e8, NOW);
        (uint256 dollars,) = consumer.getEthUsdValue(1 ether);
        assertEq(dollars, 2500e18);
        assertEq(consumer.latestPrice().roundId, 6);
    }

    function test_StaleQuoteStillReadableButCannotConvert() public {
        feed.setRound(6, 2000e8, NOW - MAX_AGE - 1);
        ETHUSDPriceFeed.PriceData memory price = consumer.latestPrice();
        assertTrue(price.valid);
        assertTrue(price.stale);
        assertEq(price.age, MAX_AGE + 1);
        vm.expectRevert(abi.encodeWithSelector(ETHUSDPriceFeed.StalePrice.selector, price.updatedAt, MAX_AGE));
        consumer.getEthUsdValue(1 ether);
    }

    function test_FreshnessBoundary() public {
        feed.setRound(6, 2000e8, NOW - MAX_AGE);
        (uint256 dollars,) = consumer.getEthUsdValue(1 ether);
        assertEq(dollars, 2000e18);
        vm.warp(NOW + 1);
        assertTrue(consumer.latestPrice().stale);
    }

    function test_InvalidRoundsReportedAndConversionRejected() public {
        _assertInvalid(0, 2000e8, NOW);
        _assertInvalid(1, 0, NOW);
        _assertInvalid(1, -1, NOW);
        _assertInvalid(1, 2000e8, 0);
        _assertInvalid(1, 2000e8, NOW + 1);
    }

    function _assertInvalid(uint80 round, int256 answer, uint256 timestamp) internal {
        feed.setRound(round, answer, timestamp);
        ETHUSDPriceFeed.PriceData memory price = consumer.latestPrice();
        assertFalse(price.valid);
        assertTrue(price.stale);
        vm.expectRevert(ETHUSDPriceFeed.InvalidPrice.selector);
        consumer.getEthUsdValue(1 ether);
    }

    function test_FeedFailuresPropagate() public {
        feed.setUnavailable(true);
        vm.expectRevert(bytes("No data present"));
        consumer.latestPrice();
        vm.expectRevert(bytes("No data present"));
        consumer.getEthUsdValue(1 ether);
    }

    function testFuzz_ConvertsDifferentFeedPrecisions(uint8 precision, uint96 weiAmount, uint64 answer) public {
        precision = uint8(bound(precision, 0, 18));
        answer = uint64(bound(answer, 1, type(uint64).max));
        feed.setDecimals(precision);
        feed.setRound(1, int256(uint256(answer)), NOW);
        (uint256 result,) = consumer.getEthUsdValue(weiAmount);
        assertEq(result, uint256(weiAmount) * uint256(answer) / (10 ** uint256(precision)));
    }

    function test_UsesFullPrecisionForIntermediateProduct() public {
        feed.setRound(1, 2000e8, NOW);
        uint256 amount = type(uint256).max / 2000;
        (uint256 result,) = consumer.getEthUsdValue(amount);
        assertEq(result, amount * 2000);
    }

    function test_UnsupportedDecimalsAfterFeedUpgradeAreInvalid() public {
        feed.setDecimals(19);
        assertFalse(consumer.latestPrice().valid);
        vm.expectRevert(ETHUSDPriceFeed.InvalidPrice.selector);
        consumer.getEthUsdValue(1 ether);
    }

    function test_RejectsZeroFeed() public {
        vm.expectRevert(ETHUSDPriceFeed.InvalidFeed.selector);
        new ETHUSDPriceFeed(address(0), MAX_AGE);
    }

    function test_RejectsFeedWithoutCode() public {
        address wallet = makeAddr("wallet");
        vm.expectRevert(ETHUSDPriceFeed.InvalidFeed.selector);
        new ETHUSDPriceFeed(wallet, MAX_AGE);
    }

    function test_RejectsZeroMaxAge() public {
        vm.expectRevert(ETHUSDPriceFeed.InvalidMaxPriceAge.selector);
        new ETHUSDPriceFeed(address(feed), 0);
    }

    function test_RejectsUnsupportedFeedDecimalsAtDeployment() public {
        feed.setDecimals(19);
        vm.expectRevert(abi.encodeWithSelector(ETHUSDPriceFeed.UnsupportedDecimals.selector, uint8(19)));
        new ETHUSDPriceFeed(address(feed), MAX_AGE);
    }
}
