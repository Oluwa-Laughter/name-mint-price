// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Common ENS resolver record interfaces, for use against an existing resolver.
/// @dev Do not deploy this interface or forward record writes through another contract.
///      Discover the name's current resolver and check its supported interfaces and authorization.
///      This is a record ABI, not the ENSv2 registry or universal-resolution ABI.
interface IENSResolver {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function addr(bytes32 node) external view returns (address payable);
    function addr(bytes32 node, uint256 coinType) external view returns (bytes memory);
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function name(bytes32 node) external view returns (string memory);
    function setAddr(bytes32 node, address addr_) external;
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addressBytes) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}
