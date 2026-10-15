// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LibAppStorage} from "../libraries/LibAppStorage.sol";

/// @notice Records public IPFS files without requiring an NFT mint.
/// @dev Registration proves who submitted a URI, not ownership, content validity, or availability.
contract FileRegistryFacet {
    error InvalidIPFSURI();
    error FileNotFound(uint256 fileId);
    error InvalidPageSize();

    uint256 public constant MAX_FILE_PAGE_SIZE = 100;

    function fileCount() public view returns (uint256) {
        return LibAppStorage.files().fileCount;
    }

    event FileRegistered(uint256 indexed fileId, address indexed uploader, string uri);

    /// @notice Pin a file through the server first, then record its URI from the user's wallet.
    /// @dev Records cannot be edited or deleted. Duplicate URIs are allowed for different submissions.
    function registerFile(string calldata uri) external returns (uint256 fileId) {
        bytes calldata value = bytes(uri);
        if (value.length <= 7 || value.length > 512) revert InvalidIPFSURI();
        if (
            value[0] != "i" || value[1] != "p" || value[2] != "f" || value[3] != "s" || value[4] != ":"
                || value[5] != "/" || value[6] != "/"
        ) revert InvalidIPFSURI();
        fileId = ++LibAppStorage.files().fileCount;
        LibAppStorage.files().files[fileId] = LibAppStorage.FileRecord(fileId, msg.sender, block.timestamp, uri);
        emit FileRegistered(fileId, msg.sender, uri);
    }

    function getFile(uint256 fileId) external view returns (LibAppStorage.FileRecord memory) {
        if (fileId == 0 || fileId > fileCount()) revert FileNotFound(fileId);
        return LibAppStorage.files().files[fileId];
    }

    /// @notice Offset 0 starts at file ID 1. Stop when nextOffset equals fileCount.
    function getFiles(uint256 offset, uint256 limit)
        external
        view
        returns (LibAppStorage.FileRecord[] memory files, uint256 nextOffset)
    {
        if (limit == 0 || limit > MAX_FILE_PAGE_SIZE) revert InvalidPageSize();
        uint256 count = fileCount();
        if (offset >= count) return (new LibAppStorage.FileRecord[](0), count);
        uint256 length = count - offset;
        if (length > limit) length = limit;
        files = new LibAppStorage.FileRecord[](length);
        for (uint256 i; i < length; ++i) {
            files[i] = LibAppStorage.files().files[offset + i + 1];
        }
        nextOffset = offset + length;
    }
}
