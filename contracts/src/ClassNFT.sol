// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClassNFT
/// @notice IPFS-backed artwork and profile cards. ENS and Chainlink are read by the frontend.
/// @dev Metadata and image URIs cannot be edited after minting. Token IDs start at 1.
contract ClassNFT is ERC721URIStorage, ReentrancyGuard {
    error InvalidTreasury();
    error IncorrectMintFee(uint256 expected, uint256 received);
    error InvalidIPFSURI();
    error InvalidPageSize();
    error NothingToWithdraw();
    error WithdrawalFailed();

    struct MintRecord {
        address creator;
        uint256 valueWei;
        uint256 mintedAt;
        string imageURI;
    }

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
    uint256 public immutable mintFee;
    address payable public immutable treasury;
    uint256 public totalSupply;
    mapping(uint256 tokenId => MintRecord) private _mintRecords;

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed creator,
        address indexed recipient,
        string metadataURI,
        string imageURI,
        uint256 valueWei
    );
    event ProceedsWithdrawn(address indexed treasury, uint256 amount);

    /// @param treasury_ Fixed recipient of mint fees; cannot be changed later.
    /// @param mintFee_ Exact mint fee in wei. Set to 0 for free mints (gas still applies).
    constructor(address payable treasury_, uint256 mintFee_) ERC721("ClassNFT", "CLASS") {
        if (treasury_ == address(0) || treasury_ == address(this)) revert InvalidTreasury();
        treasury = treasury_;
        mintFee = mintFee_;
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
        if (msg.value != mintFee) revert IncorrectMintFee(mintFee, msg.value);
        _validateIPFSURI(metadataURI);
        _validateIPFSURI(imageURI);

        tokenId = ++totalSupply;
        _mintRecords[tokenId] = MintRecord(msg.sender, msg.value, block.timestamp, imageURI);
        // URIStorage permits setting a URI before minting. Receiver callbacks see complete metadata.
        _setTokenURI(tokenId, metadataURI);
        _safeMint(to, tokenId);

        emit NFTMinted(tokenId, msg.sender, to, metadataURI, imageURI, msg.value);
    }

    /// @notice Original mint details; ownerOf(tokenId) returns the current owner after transfers.
    function mintRecord(uint256 tokenId) external view returns (MintRecord memory) {
        _requireOwned(tokenId);
        return _mintRecords[tokenId];
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
        uint256 supply = totalSupply;
        if (offset >= supply) return (new GalleryItem[](0), supply);
        uint256 count = supply - offset;
        if (count > limit) count = limit;
        items = new GalleryItem[](count);
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = offset + i + 1;
            MintRecord storage record = _mintRecords[tokenId];
            items[i] = GalleryItem({
                tokenId: tokenId,
                owner: ownerOf(tokenId),
                creator: record.creator,
                valueWei: record.valueWei,
                mintedAt: record.mintedAt,
                metadataURI: tokenURI(tokenId),
                imageURI: record.imageURI
            });
        }
        nextOffset = offset + count;
    }

    /// @notice Anyone may trigger payout, but funds always go to the immutable treasury.
    function withdraw() external nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();
        (bool success,) = treasury.call{value: amount}("");
        if (!success) revert WithdrawalFailed();
        emit ProceedsWithdrawn(treasury, amount);
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
