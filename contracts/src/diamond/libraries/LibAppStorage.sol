// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library LibAppStorage {
    bytes32 internal constant NFT_SLOT = keccak256("name.mint.nft.storage.v1");
    bytes32 internal constant PRICE_SLOT = keccak256("name.mint.price.storage.v1");
    bytes32 internal constant FILE_SLOT = keccak256("name.mint.files.storage.v1");

    struct MintRecord {
        address creator;
        uint256 valueWei;
        uint256 mintedAt;
        string imageURI;
    }

    struct NFTStorage {
        uint256 mintFee;
        address payable treasury;
        uint256 totalSupply;
        mapping(uint256 => MintRecord) records;
    }

    struct PriceStorage {
        address feed;
        uint256 maxPriceAge;
    }

    struct FileRecord {
        uint256 fileId;
        address uploader;
        uint256 registeredAt;
        string uri;
    }

    struct FileStorage {
        uint256 fileCount;
        mapping(uint256 => FileRecord) files;
    }

    function nft() internal pure returns (NFTStorage storage s) {
        bytes32 slot = NFT_SLOT;
        assembly { s.slot := slot }
    }

    function price() internal pure returns (PriceStorage storage s) {
        bytes32 slot = PRICE_SLOT;
        assembly { s.slot := slot }
    }

    function files() internal pure returns (FileStorage storage s) {
        bytes32 slot = FILE_SLOT;
        assembly { s.slot := slot }
    }
}
