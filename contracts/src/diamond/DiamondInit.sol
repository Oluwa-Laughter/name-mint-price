// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NFTFacet} from "./facets/NFTFacet.sol";
import {PriceFeedFacet} from "./facets/PriceFeedFacet.sol";
import {LibDiamond} from "./libraries/LibDiamond.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "./interfaces/IDiamondLoupe.sol";
import {IERC173} from "./interfaces/IERC173.sol";

/// @dev Only delegatecalled during Diamond construction; never install its selector.
contract DiamondInit is NFTFacet, PriceFeedFacet {
    function initialize(address payable treasury_, uint256 fee_, address feed_, uint256 maxAge_) external initializer {
        require(address(this).code.length == 0, "DiamondInit: constructor only");
        _initializeNFT(treasury_, fee_);
        _initializePrice(feed_, maxAge_);
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[0x01ffc9a7] = true; // ERC165
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;
        ds.supportedInterfaces[0x80ac58cd] = true; // ERC721
        ds.supportedInterfaces[0x5b5e139f] = true; // ERC721Metadata
        ds.supportedInterfaces[0x49064906] = true; // ERC4906
    }
}
