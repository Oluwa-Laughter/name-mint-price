// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDiamondCut} from "./interfaces/IDiamondCut.sol";
import {DiamondCutFacet} from "./facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "./facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "./facets/OwnershipFacet.sol";
import {NFTFacet} from "./facets/NFTFacet.sol";
import {PriceFeedFacet} from "./facets/PriceFeedFacet.sol";
import {FileRegistryFacet} from "./facets/FileRegistryFacet.sol";

/// @dev Shared selector list used by deployment and tests. Never include initializer selectors.
library DiamondDeployment {
    function deployFacets() internal returns (IDiamondCut.FacetCut[] memory cuts) {
        cuts = new IDiamondCut.FacetCut[](6);
        bytes4[] memory selectors;
        selectors = new bytes4[](1);
        selectors[0] = bytes4(keccak256("diamondCut((address,uint8,bytes4[])[],address,bytes)"));
        cuts[0] = IDiamondCut.FacetCut(address(new DiamondCutFacet()), IDiamondCut.FacetCutAction.Add, selectors);
        selectors = new bytes4[](5);
        selectors[0] = bytes4(keccak256("facets()"));
        selectors[1] = bytes4(keccak256("facetFunctionSelectors(address)"));
        selectors[2] = bytes4(keccak256("facetAddresses()"));
        selectors[3] = bytes4(keccak256("facetAddress(bytes4)"));
        selectors[4] = bytes4(keccak256("supportsInterface(bytes4)"));
        cuts[1] = IDiamondCut.FacetCut(address(new DiamondLoupeFacet()), IDiamondCut.FacetCutAction.Add, selectors);
        selectors = new bytes4[](2);
        selectors[0] = bytes4(keccak256("owner()"));
        selectors[1] = bytes4(keccak256("transferOwnership(address)"));
        cuts[2] = IDiamondCut.FacetCut(address(new OwnershipFacet()), IDiamondCut.FacetCutAction.Add, selectors);
        selectors = new bytes4[](20);
        selectors[0] = bytes4(keccak256("name()"));
        selectors[1] = bytes4(keccak256("symbol()"));
        selectors[2] = bytes4(keccak256("tokenURI(uint256)"));
        selectors[3] = bytes4(keccak256("balanceOf(address)"));
        selectors[4] = bytes4(keccak256("ownerOf(uint256)"));
        selectors[5] = bytes4(keccak256("approve(address,uint256)"));
        selectors[6] = bytes4(keccak256("getApproved(uint256)"));
        selectors[7] = bytes4(keccak256("setApprovalForAll(address,bool)"));
        selectors[8] = bytes4(keccak256("isApprovedForAll(address,address)"));
        selectors[9] = bytes4(keccak256("transferFrom(address,address,uint256)"));
        selectors[10] = bytes4(keccak256("safeTransferFrom(address,address,uint256)"));
        selectors[11] = bytes4(keccak256("safeTransferFrom(address,address,uint256,bytes)"));
        selectors[12] = bytes4(keccak256("mint(address,string,string)"));
        selectors[13] = bytes4(keccak256("mintFee()"));
        selectors[14] = bytes4(keccak256("treasury()"));
        selectors[15] = bytes4(keccak256("totalSupply()"));
        selectors[16] = bytes4(keccak256("mintRecord(uint256)"));
        selectors[17] = bytes4(keccak256("getTokens(uint256,uint256)"));
        selectors[18] = bytes4(keccak256("withdraw()"));
        selectors[19] = bytes4(keccak256("MAX_PAGE_SIZE()"));
        cuts[3] = IDiamondCut.FacetCut(address(new NFTFacet()), IDiamondCut.FacetCutAction.Add, selectors);
        selectors = new bytes4[](4);
        selectors[0] = bytes4(keccak256("feed()"));
        selectors[1] = bytes4(keccak256("maxPriceAge()"));
        selectors[2] = bytes4(keccak256("latestPrice()"));
        selectors[3] = bytes4(keccak256("getEthUsdValue(uint256)"));
        cuts[4] = IDiamondCut.FacetCut(address(new PriceFeedFacet()), IDiamondCut.FacetCutAction.Add, selectors);
        selectors = new bytes4[](5);
        selectors[0] = bytes4(keccak256("fileCount()"));
        selectors[1] = bytes4(keccak256("registerFile(string)"));
        selectors[2] = bytes4(keccak256("getFile(uint256)"));
        selectors[3] = bytes4(keccak256("getFiles(uint256,uint256)"));
        selectors[4] = bytes4(keccak256("MAX_FILE_PAGE_SIZE()"));
        cuts[5] = IDiamondCut.FacetCut(address(new FileRegistryFacet()), IDiamondCut.FacetCutAction.Add, selectors);
    }
}
