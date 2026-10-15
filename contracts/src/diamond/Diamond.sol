// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibDiamond} from "./libraries/LibDiamond.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";

/// @notice EIP-2535 router. Application calls and state belong to this address.
contract Diamond {
    constructor(address owner_, IDiamondCut.FacetCut[] memory cuts, address init, bytes memory data) payable {
        require(owner_ != address(0), "Diamond: zero owner");
        LibDiamond.setContractOwner(owner_);
        LibDiamond.diamondCut(cuts, init, data);
    }

    fallback() external payable {
        address facet = LibDiamond.diamondStorage().selectorToFacetAndPosition[msg.sig].facetAddress;
        require(facet != address(0), "Diamond: unknown selector");
        assembly {
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch success
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    receive() external payable {}
}
