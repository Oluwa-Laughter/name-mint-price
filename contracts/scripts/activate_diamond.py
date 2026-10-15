#!/usr/bin/env python3
"""Validate a deployed Sepolia Diamond, then activate its address and export bindings."""
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2 or not re.fullmatch(r"0x[0-9a-fA-F]{40}", sys.argv[1]):
    raise SystemExit("Usage: python3 scripts/activate_diamond.py <deployed-diamond-address>")
address = sys.argv[1]

def cast(*args):
    result = subprocess.run(["cast", *args, "--rpc-url", "sepolia"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("Sepolia verification failed. Check local RPC configuration; manifest was not changed.")
    return result.stdout.strip()

if cast("chain-id") != "11155111":
    raise SystemExit("RPC is not Sepolia; manifest was not changed.")
if cast("code", address) == "0x":
    raise SystemExit("No code at that address; manifest was not changed.")
# Validate every application and management selector, without sending transactions.
for name in ["NFTFacet", "PriceFeedFacet", "FileRegistryFacet", "DiamondCutFacet", "DiamondLoupeFacet", "OwnershipFacet"]:
    result = subprocess.run(["forge", "inspect", name, "methodIdentifiers", "--json"], cwd=ROOT, check=True, capture_output=True, text=True)
    for signature, selector in json.loads(result.stdout).items():
        if name == "NFTFacet" and signature == "supportsInterface(bytes4)":
            continue  # The loupe owns the shared ERC165 selector.
        facet = cast("call", address, "facetAddress(bytes4)(address)", "0x" + selector)
        if facet.lower() == "0x" + "0" * 40 or cast("code", facet) == "0x":
            raise SystemExit(f"Missing {name}.{signature}; manifest was not changed.")
if cast("call", address, "supportsInterface(bytes4)(bool)", "0x80ac58cd") != "true":
    raise SystemExit("ERC721 support missing; manifest was not changed.")
owner = cast("call", address, "owner()(address)")
if owner.lower() == "0x" + "0" * 40:
    raise SystemExit("Diamond has no upgrade owner; manifest was not changed.")
feed = cast("call", address, "feed()(address)")
manifest_path = ROOT / "deployments/sepolia.json"
manifest = json.loads(manifest_path.read_text())
if feed.lower() != manifest["chainlinkEthUsdAggregator"].lower():
    raise SystemExit("Unexpected Chainlink feed; manifest was not changed.")
manifest["diamondAddress"] = address
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
subprocess.run([sys.executable, str(ROOT / "scripts/export_abi.py")], cwd=ROOT, check=True)
print(f"Activated Sepolia Diamond {address}. Upgrade owner: {owner}. Legacy addresses retained for reference.")
