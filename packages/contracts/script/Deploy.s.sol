// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {EventTicketing} from "../src/EventTicketing.sol";

/// @title Deploy
/// @notice Foundry deployment script for `EventTicketing`, targeting Base Sepolia.
/// @dev Reads the deployer key and the ERC-1155 metadata base URI from the
///      environment so no secrets are committed. Run with, for example:
///
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url "$BASE_SEPOLIA_RPC_URL" \
///          --broadcast --verify \
///          --etherscan-api-key "$BASESCAN_API_KEY"
///
///      Environment variables (see `.env.example`):
///        - PRIVATE_KEY          Deployer private key (uint256, 0x-prefixed).
///        - TICKET_BASE_URI       Optional ERC-1155 base URI; falls back to a
///                                sensible default when unset.
///        - BASE_SEPOLIA_RPC_URL  RPC endpoint (consumed via --rpc-url).
///        - BASESCAN_API_KEY      Explorer key for --verify (consumed via CLI).
contract Deploy is Script {
    /// @dev Default metadata URI used when `TICKET_BASE_URI` is not set.
    string internal constant DEFAULT_URI = "ipfs://REPLACE_WITH_CID/{id}.json";

    function run() external returns (EventTicketing ticketing) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        string memory uri = vm.envOr("TICKET_BASE_URI", DEFAULT_URI);

        vm.startBroadcast(deployerKey);
        ticketing = new EventTicketing(uri);
        vm.stopBroadcast();

        console2.log("EventTicketing deployed at:", address(ticketing));
        console2.log("Metadata base URI:", uri);
    }
}
