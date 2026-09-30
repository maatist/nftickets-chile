// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EventTicketing} from "../src/EventTicketing.sol";

/// @dev Handler that drives randomized sequences of buys, resales, and
///      validations against a single seeded (eventId, tier). The invariant
///      suite calls into this handler with fuzzed inputs; the handler bounds
///      them into the valid domain, executes the corresponding contract call,
///      and records the serials it has validated so the invariant checker can
///      assert used serials never revert to unused.
contract TicketingHandler is Test {
    EventTicketing public ticketing;

    uint256 public constant EVENT_ID = 42;
    uint256 public constant TIER = 0;
    uint256 public constant MAX_SUPPLY = 1_000;
    uint256 public constant PRICE = 0.01 ether;
    uint256 public constant RESALE_CAP = 0.02 ether;

    address public organizer = makeAddr("h_organizer");
    address public gateStaff = makeAddr("h_gateStaff");

    // Actors that can hold/buy tickets.
    address[] internal actors;

    // Serials this handler has validated at the gate.
    uint256[] public validatedSerials;
    mapping(uint256 => bool) public sawValidated;

    // Ghost record of who owns each serial (mirrors serialOwner for resale routing).
    mapping(uint256 => address) internal ghostOwner;

    constructor(EventTicketing ticketing_) {
        ticketing = ticketing_;

        actors.push(makeAddr("h_actor0"));
        actors.push(makeAddr("h_actor1"));
        actors.push(makeAddr("h_actor2"));

        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, MAX_SUPPLY, PRICE, RESALE_CAP, address(0));
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);
        vm.stopPrank();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// @dev Buy 1..5 tickets, respecting remaining supply.
    function buy(uint256 actorSeed, uint256 qty) external {
        (uint256 maxSupply, uint256 minted,,,,) = ticketing.tiers(EVENT_ID, TIER);
        uint256 remaining = maxSupply - minted;
        if (remaining == 0) return;
        qty = bound(qty, 1, remaining < 5 ? remaining : 5);

        address actor = _actor(actorSeed);
        uint256 total = PRICE * qty;
        uint256 startSerial = ticketing.nextSerial(EVENT_ID, TIER);

        vm.deal(actor, total);
        vm.prank(actor);
        ticketing.buyTicket{value: total}(EVENT_ID, TIER, qty);

        for (uint256 i = 0; i < qty; ++i) {
            ghostOwner[startSerial + i] = actor;
        }
    }

    /// @dev Resell an existing serial to a different actor within the cap.
    function resell(uint256 serialSeed, uint256 buyerSeed, uint256 price) external {
        uint256 next = ticketing.nextSerial(EVENT_ID, TIER);
        if (next == 0) return;
        uint256 serial = serialSeed % next;

        address seller = ticketing.serialOwner(EVENT_ID, TIER, serial);
        if (seller == address(0)) return;
        if (ticketing.isTicketUsed(EVENT_ID, TIER, serial)) return;

        address buyer = _actor(buyerSeed);
        if (buyer == seller) return;

        price = bound(price, 0, RESALE_CAP);

        vm.deal(buyer, price);
        vm.prank(buyer);
        ticketing.resellTicket{value: price}(EVENT_ID, TIER, serial, buyer, price);
        ghostOwner[serial] = buyer;
    }

    /// @dev Validate an existing, unused serial at the gate.
    function validate(uint256 serialSeed) external {
        uint256 next = ticketing.nextSerial(EVENT_ID, TIER);
        if (next == 0) return;
        uint256 serial = serialSeed % next;

        address owner = ticketing.serialOwner(EVENT_ID, TIER, serial);
        if (owner == address(0)) return;
        if (ticketing.isTicketUsed(EVENT_ID, TIER, serial)) return;

        vm.prank(gateStaff);
        ticketing.validateTicket(EVENT_ID, TIER, serial, owner);

        if (!sawValidated[serial]) {
            sawValidated[serial] = true;
            validatedSerials.push(serial);
        }
    }

    function validatedCount() external view returns (uint256) {
        return validatedSerials.length;
    }
}

/// @dev Invariant suite: over any sequence of handler calls, minted never
///      exceeds maxSupply and a serial that has been validated (used) never
///      returns to unused.
contract EventTicketingInvariantTest is Test {
    EventTicketing internal ticketing;
    TicketingHandler internal handler;

    function setUp() public {
        ticketing = new EventTicketing("ipfs://inv/{id}.json");
        handler = new TicketingHandler(ticketing);

        // Only fuzz the handler's entrypoints.
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = TicketingHandler.buy.selector;
        selectors[1] = TicketingHandler.resell.selector;
        selectors[2] = TicketingHandler.validate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Invariant: minted <= maxSupply for the seeded tier.
    function invariant_mintedNeverExceedsMaxSupply() public view {
        (uint256 maxSupply, uint256 minted,,,,) = ticketing.tiers(handler.EVENT_ID(), handler.TIER());
        assertLe(minted, maxSupply, "minted exceeded maxSupply");
    }

    /// @dev Invariant: every serial the handler has validated remains used.
    function invariant_usedSerialNeverResets() public view {
        uint256 count = handler.validatedCount();
        for (uint256 i = 0; i < count; ++i) {
            uint256 serial = handler.validatedSerials(i);
            assertTrue(ticketing.isUsed(handler.EVENT_ID(), handler.TIER(), serial), "used serial reverted to unused");
        }
    }
}
