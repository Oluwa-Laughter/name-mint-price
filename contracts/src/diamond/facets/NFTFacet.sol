// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibAppStorage} from "../libraries/LibAppStorage.sol";

import {
    ERC721URIStorageUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title NFTFacet
/// @notice ERC-721 facet with ERC-7201 token storage and namespaced application records.
/// @dev Current implementation has no URI setters. The Diamond owner can replace facets. Token IDs start at 1.
contract NFTFacet is ERC721URIStorageUpgradeable, ReentrancyGuardUpgradeable {
    error InvalidTreasury();
    error IncorrectMintFee(uint256 expected, uint256 received);
    error InvalidIPFSURI();
    error InvalidPageSize();
    error NothingToWithdraw();
    error WithdrawalFailed();

    struct GalleryItem {
        uint256 tokenId;
        address owner;
        address creator;
        uint256 valueWei;
        uint256 mintedAt;
        string metadataURI;
        string imageURI;
    }

    uint256 public constant MAX_PAGE_SIZE = 100;

    constructor() {
        _disableInitializers();
    }

    function mintFee() public view returns (uint256) {
        return LibAppStorage.nft().mintFee;
    }

    function treasury() public view returns (address payable) {
        return LibAppStorage.nft().treasury;
    }

    function totalSupply() public view returns (uint256) {
        return LibAppStorage.nft().totalSupply;
    }

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed creator,
        address indexed recipient,
        string metadataURI,
        string imageURI,
        uint256 valueWei
    );
    event ProceedsWithdrawn(address indexed treasury, uint256 amount);

    function _initializeNFT(address payable treasury_, uint256 mintFee_) internal onlyInitializing {
        if (treasury_ == address(0) || treasury_ == address(this)) revert InvalidTreasury();
        __ERC721_init("Name & Mint", "NMINT");
        __ERC721URIStorage_init();
        __ReentrancyGuard_init();
        LibAppStorage.nft().treasury = treasury_;
        LibAppStorage.nft().mintFee = mintFee_;
    }

    /// @notice Mint to a wallet address, including one resolved from an ENS name by the frontend.
    /// @dev Pin the file and then metadata JSON through the server before calling this method.
    ///      The metadata JSON must contain an `image` field matching imageURI.
    function mint(address to, string calldata metadataURI, string calldata imageURI)
        external
        payable
        nonReentrant
        returns (uint256 tokenId)
    {
        if (msg.value != mintFee()) revert IncorrectMintFee(mintFee(), msg.value);
        _validateIPFSURI(metadataURI);
        _validateIPFSURI(imageURI);

        tokenId = ++LibAppStorage.nft().totalSupply;
        LibAppStorage.nft().records[tokenId] =
            LibAppStorage.MintRecord(msg.sender, msg.value, block.timestamp, imageURI);
        // URIStorage permits setting a URI before minting. Receiver callbacks see complete metadata.
        _setTokenURI(tokenId, metadataURI);
        _safeMint(to, tokenId);

        emit NFTMinted(tokenId, msg.sender, to, metadataURI, imageURI, msg.value);
    }

    /// @notice Original mint details; ownerOf(tokenId) returns the current owner after transfers.
    function mintRecord(uint256 tokenId) external view returns (LibAppStorage.MintRecord memory) {
        _requireOwned(tokenId);
        return LibAppStorage.nft().records[tokenId];
    }

    /// @notice Paginated gallery with current ownership, without requiring an event indexer.
    /// @param offset Number of earlier tokens to skip; 0 starts with token ID 1.
    /// @param limit Number of tokens to return, from 1 to MAX_PAGE_SIZE.
    /// @return items The requested page, empty when offset is beyond the minted supply.
    /// @return nextOffset Pass this offset to load the next page. Done when it equals totalSupply.
    function getTokens(uint256 offset, uint256 limit)
        external
        view
        returns (GalleryItem[] memory items, uint256 nextOffset)
    {
        if (limit == 0 || limit > MAX_PAGE_SIZE) revert InvalidPageSize();
        uint256 supply = totalSupply();
        if (offset >= supply) return (new GalleryItem[](0), supply);
        uint256 count = supply - offset;
        if (count > limit) count = limit;
        items = new GalleryItem[](count);
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = offset + i + 1;
            LibAppStorage.MintRecord storage record = LibAppStorage.nft().records[tokenId];
            GalleryItem memory item;
            item.tokenId = tokenId;
            item.owner = ownerOf(tokenId);
            item.creator = record.creator;
            item.valueWei = record.valueWei;
            item.mintedAt = record.mintedAt;
            item.metadataURI = tokenURI(tokenId);
            item.imageURI = record.imageURI;
            items[i] = item;
        }
        nextOffset = offset + count;
    }

    /// @notice Anyone may trigger payout, but funds always go to the configured treasury.
    function withdraw() external nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        (bool success,) = treasury().call{value: amount}("");
        if (!success) revert WithdrawalFailed();
        emit ProceedsWithdrawn(treasury(), amount);
    }

    /// @dev Checks URI shape only; availability and metadata contents must be checked off-chain.
    function _validateIPFSURI(string calldata uri) private pure {
        bytes calldata value = bytes(uri);
        if (value.length <= 7 || value.length > 512) revert InvalidIPFSURI();
        if (
            value[0] != "i" || value[1] != "p" || value[2] != "f" || value[3] != "s" || value[4] != ":"
                || value[5] != "/" || value[6] != "/"
        ) revert InvalidIPFSURI();
    }
}
