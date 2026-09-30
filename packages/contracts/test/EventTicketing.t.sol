// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EventTicketing} from "../src/EventTicketing.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal mintable ERC-20 used to exercise ERC-20 payment paths.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Malicious ERC-20 that re-enters buyTicket during transferFrom.
///      Used to prove the nonReentrant guard blocks reentrancy on purchase.
contract ReentrantToken is ERC20 {
    EventTicketing internal target;
    uint256 internal reEventId;
    uint256 internal reTier;
    bool internal attacking;

    constructor() ERC20("Reentrant", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(EventTicketing target_, uint256 eventId_, uint256 tier_) external {
        target = target_;
        reEventId = eventId_;
        reTier = tier_;
        attacking = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attacking) {
            attacking = false; // avoid infinite recursion in the test harness
            // Attempt to re-enter the guarded purchase function.
            target.buyTicket(reEventId, reTier, 1);
        }
        return super.transferFrom(from, to, amount);
    }
}

/// @dev Organizer contract that attempts to re-enter withdraw() from its
///      native receive hook. Proves the nonReentrant guard + checks-effects
///      ordering block reentrancy on native withdrawal.
contract ReentrantOrganizer {
    EventTicketing internal target;
    uint256 internal eventId;
    bool internal attacking;

    function setTarget(EventTicketing target_, uint256 eventId_) external {
        target = target_;
        eventId = eventId_;
    }

    function createEvent(uint256 eventId_) external {
        target.createEvent(eventId_);
    }

    function addTier(
        uint256 eventId_,
        uint256 tier_,
        uint256 maxSupply_,
        uint256 price_,
        uint256 maxResalePrice_,
        address payToken_
    ) external {
        target.addTier(eventId_, tier_, maxSupply_, price_, maxResalePrice_, payToken_);
    }

    function doWithdraw() external {
        attacking = true;
        target.withdraw(eventId, address(0));
    }

    receive() external payable {
        if (attacking) {
            attacking = false; // guard against infinite recursion in the harness
            // Re-entrant withdraw must revert; funds have already been zeroed.
            target.withdraw(eventId, address(0));
        }
    }
}

contract EventTicketingTest is Test {
    EventTicketing internal ticketing;

    address internal deployer = address(this);
    address internal organizer = makeAddr("organizer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant EVENT_ID = 1;
    uint256 internal constant TIER = 0;

    // Mirror contract events for expectEmit.
    event EventCreated(uint256 indexed eventId, address indexed organizer);
    event TierAdded(
        uint256 indexed eventId,
        uint256 indexed tier,
        uint256 maxSupply,
        uint256 price,
        uint256 maxResalePrice,
        address payToken
    );
    event TicketPurchased(
        uint256 indexed eventId, uint256 indexed tier, address indexed buyer, uint256 quantity, uint256 startSerial
    );
    event TicketResold(
        uint256 indexed eventId, uint256 indexed tier, uint256 serial, address seller, address buyer, uint256 price
    );
    event TicketValidated(
        uint256 indexed eventId, uint256 indexed tier, uint256 serial, address ticketOwner, address validator
    );
    event Withdrawn(uint256 indexed eventId, address indexed token, address indexed organizer, uint256 amount);

    address internal buyer = makeAddr("buyer");
    address internal reseller = makeAddr("reseller");

    function setUp() public {
        ticketing = new EventTicketing("ipfs://base/{id}.json");
    }

    // ------------------------------------------------------------------
    // createEvent
    // ------------------------------------------------------------------

    function test_createEvent_registersOrganizerAndActive() public {
        vm.prank(organizer);
        vm.expectEmit(true, true, false, false);
        emit EventCreated(EVENT_ID, organizer);
        ticketing.createEvent(EVENT_ID);

        (address org, bool active, bool exists) = ticketing.events(EVENT_ID);
        assertEq(org, organizer, "organizer");
        assertTrue(active, "active");
        assertTrue(exists, "exists");
    }

    function test_createEvent_revertsWhenEventExists() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.prank(organizer);
        vm.expectRevert(EventTicketing.EventExists.selector);
        ticketing.createEvent(EVENT_ID);
    }

    function test_createEvent_differentOrganizersDistinctEvents() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.prank(stranger);
        ticketing.createEvent(EVENT_ID + 1);

        (address org1,,) = ticketing.events(EVENT_ID);
        (address org2,,) = ticketing.events(EVENT_ID + 1);
        assertEq(org1, organizer);
        assertEq(org2, stranger);
    }

    // ------------------------------------------------------------------
    // addTier
    // ------------------------------------------------------------------

    function test_addTier_registersTierAndEmits() public {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.expectEmit(true, true, false, true);
        emit TierAdded(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));
        ticketing.addTier(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));
        vm.stopPrank();

        (uint256 maxSupply, uint256 minted, uint256 price, uint256 maxResalePrice, address payToken, bool exists) =
            ticketing.tiers(EVENT_ID, TIER);

        assertEq(maxSupply, 100, "maxSupply");
        assertEq(minted, 0, "minted");
        assertEq(price, 1 ether, "price");
        assertEq(maxResalePrice, 2 ether, "maxResalePrice");
        assertEq(payToken, address(0), "payToken");
        assertTrue(exists, "exists");
    }

    function test_addTier_allowsResaleCapEqualToPrice() public {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 10, 1 ether, 1 ether, address(0));
        vm.stopPrank();

        (,,, uint256 maxResalePrice,,) = ticketing.tiers(EVENT_ID, TIER);
        assertEq(maxResalePrice, 1 ether);
    }

    function test_addTier_revertsForUnknownEvent() public {
        vm.prank(organizer);
        vm.expectRevert(EventTicketing.EventNotFound.selector);
        ticketing.addTier(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));
    }

    function test_addTier_revertsWhenCallerNotOrganizer() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.prank(stranger);
        vm.expectRevert(EventTicketing.NotOrganizer.selector);
        ticketing.addTier(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));
    }

    function test_addTier_revertsWhenTierExists() public {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));

        vm.expectRevert(EventTicketing.TierExists.selector);
        ticketing.addTier(EVENT_ID, TIER, 50, 1 ether, 2 ether, address(0));
        vm.stopPrank();
    }

    function test_addTier_revertsWhenMaxSupplyZero() public {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.expectRevert(EventTicketing.InvalidSupply.selector);
        ticketing.addTier(EVENT_ID, TIER, 0, 1 ether, 2 ether, address(0));
        vm.stopPrank();
    }

    function test_addTier_revertsWhenResaleCapBelowPrice() public {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.expectRevert(EventTicketing.InvalidResaleCap.selector);
        ticketing.addTier(EVENT_ID, TIER, 100, 2 ether, 1 ether, address(0));
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // buyTicket — helpers
    // ------------------------------------------------------------------

    /// @dev Creates EVENT_ID/TIER with a native tier of the given supply/price.
    function _seedNativeTier(uint256 maxSupply, uint256 price) internal {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, maxSupply, price, price, address(0));
        vm.stopPrank();
    }

    /// @dev Creates EVENT_ID/TIER with an ERC-20 tier; returns the mock token.
    function _seedErc20Tier(uint256 maxSupply, uint256 price) internal returns (MockERC20 token) {
        token = new MockERC20();
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, maxSupply, price, price, address(token));
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // buyTicket — native
    // ------------------------------------------------------------------

    function test_buyTicket_nativeMintsAndAssignsSerials() public {
        _seedNativeTier(100, 1 ether);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        vm.deal(buyer, 3 ether);
        vm.prank(buyer);
        vm.expectEmit(true, true, true, true);
        emit TicketPurchased(EVENT_ID, TIER, buyer, 3, 0);
        ticketing.buyTicket{value: 3 ether}(EVENT_ID, TIER, 3);

        assertEq(ticketing.balanceOf(buyer, tokenId), 3, "balance");
        assertEq(ticketing.nextSerial(EVENT_ID, TIER), 3, "nextSerial");
        (, uint256 minted,,,,) = ticketing.tiers(EVENT_ID, TIER);
        assertEq(minted, 3, "minted");
        assertEq(ticketing.proceeds(EVENT_ID, address(0)), 3 ether, "proceeds");

        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 0), buyer, "serial 0");
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 1), buyer, "serial 1");
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 2), buyer, "serial 2");
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 3), address(0), "serial 3 unassigned");
    }

    function test_buyTicket_nativeSerialsAreSequentialAcrossPurchases() public {
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 2 ether);
        vm.deal(stranger, 1 ether);

        vm.prank(buyer);
        ticketing.buyTicket{value: 2 ether}(EVENT_ID, TIER, 2);
        vm.prank(stranger);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);

        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 0), buyer);
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 1), buyer);
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 2), stranger);
        assertEq(ticketing.nextSerial(EVENT_ID, TIER), 3);
    }

    function test_buyTicket_revertsWhenNativeValueTooLow() public {
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.InsufficientPayment.selector);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 2);
    }

    function test_buyTicket_revertsWhenNativeValueTooHigh() public {
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 5 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.InsufficientPayment.selector);
        ticketing.buyTicket{value: 3 ether}(EVENT_ID, TIER, 2);
    }

    function test_buyTicket_revertsWhenSoldOut() public {
        _seedNativeTier(2, 1 ether);
        vm.deal(buyer, 3 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.SoldOut.selector);
        ticketing.buyTicket{value: 3 ether}(EVENT_ID, TIER, 3);
    }

    function test_buyTicket_revertsWhenQuantityZero() public {
        _seedNativeTier(100, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.InvalidQuantity.selector);
        ticketing.buyTicket(EVENT_ID, TIER, 0);
    }

    function test_buyTicket_revertsForUnknownEvent() public {
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.EventNotFound.selector);
        ticketing.buyTicket(EVENT_ID, TIER, 1);
    }

    function test_buyTicket_revertsForUnknownTier() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.TierNotFound.selector);
        ticketing.buyTicket(EVENT_ID, TIER, 1);
    }

    // ------------------------------------------------------------------
    // buyTicket — ERC-20
    // ------------------------------------------------------------------

    function test_buyTicket_erc20MintsAndPullsPayment() public {
        MockERC20 token = _seedErc20Tier(100, 10e18);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        token.mint(buyer, 100e18);
        vm.startPrank(buyer);
        token.approve(address(ticketing), 20e18);
        vm.expectEmit(true, true, true, true);
        emit TicketPurchased(EVENT_ID, TIER, buyer, 2, 0);
        ticketing.buyTicket(EVENT_ID, TIER, 2);
        vm.stopPrank();

        assertEq(ticketing.balanceOf(buyer, tokenId), 2, "balance");
        assertEq(token.balanceOf(address(ticketing)), 20e18, "escrowed");
        assertEq(token.balanceOf(buyer), 80e18, "buyer remaining");
        assertEq(ticketing.proceeds(EVENT_ID, address(token)), 20e18, "proceeds");
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 1), buyer, "serial 1");
    }

    function test_buyTicket_erc20RevertsWithoutApproval() public {
        MockERC20 token = _seedErc20Tier(100, 10e18);
        token.mint(buyer, 100e18);
        vm.prank(buyer);
        vm.expectRevert(); // SafeERC20 wraps the allowance failure
        ticketing.buyTicket(EVENT_ID, TIER, 1);
    }

    function test_buyTicket_erc20RevertsWhenNativeValueSent() public {
        MockERC20 token = _seedErc20Tier(100, 10e18);
        token.mint(buyer, 100e18);
        vm.deal(buyer, 1 ether);
        vm.startPrank(buyer);
        token.approve(address(ticketing), 10e18);
        vm.expectRevert(EventTicketing.InsufficientPayment.selector);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // buyTicket — reentrancy
    // ------------------------------------------------------------------

    function test_buyTicket_reentrancyAttemptReverts() public {
        ReentrantToken evil = new ReentrantToken();
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, 10e18, 10e18, address(evil));
        vm.stopPrank();

        evil.mint(buyer, 100e18);
        evil.setAttack(ticketing, EVENT_ID, TIER);

        vm.startPrank(buyer);
        evil.approve(address(ticketing), 100e18);
        // The re-entrant buyTicket call triggered inside transferFrom must revert,
        // bubbling up and reverting the outer purchase.
        vm.expectRevert();
        ticketing.buyTicket(EVENT_ID, TIER, 1);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Direct transfer enforcement (R3)
    // ------------------------------------------------------------------

    function test_directSafeTransferFrom_reverts() public {
        _seedNativeTier(100, 1 ether);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);

        // A direct holder-to-holder transfer must be blocked.
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.DirectTransferBlocked.selector);
        ticketing.safeTransferFrom(buyer, reseller, tokenId, 1, "");
    }

    function test_directSafeBatchTransferFrom_reverts() public {
        _seedNativeTier(100, 1 ether);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 2 ether}(EVENT_ID, TIER, 2);

        uint256[] memory ids = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        ids[0] = tokenId;
        amounts[0] = 1;

        vm.prank(buyer);
        vm.expectRevert(EventTicketing.DirectTransferBlocked.selector);
        ticketing.safeBatchTransferFrom(buyer, reseller, ids, amounts, "");
    }

    // ------------------------------------------------------------------
    // resellTicket — native
    // ------------------------------------------------------------------

    /// @dev Seeds a native tier and gives `seller` one ticket at serial 0.
    function _seedAndBuyNative(uint256 price, uint256 resaleCap, address seller_) internal returns (uint256 tokenId) {
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, price, resaleCap, address(0));
        vm.stopPrank();

        tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));
        vm.deal(seller_, price);
        vm.prank(seller_);
        ticketing.buyTicket{value: price}(EVENT_ID, TIER, 1);
    }

    function test_resellTicket_nativeWithinCapTransfersAndPaysSeller() public {
        uint256 tokenId = _seedAndBuyNative(1 ether, 2 ether, reseller);

        // The buyer submits the resale tx supplying msg.value; the contract
        // forwards the price to the seller (the current serial owner).
        uint256 resalePrice = 1.5 ether;
        vm.deal(buyer, resalePrice);
        uint256 sellerBefore = reseller.balance;
        uint256 buyerBefore = buyer.balance;

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true);
        emit TicketResold(EVENT_ID, TIER, 0, reseller, buyer, resalePrice);
        ticketing.resellTicket{value: resalePrice}(EVENT_ID, TIER, 0, buyer, resalePrice);

        // Ticket moved to buyer.
        assertEq(ticketing.balanceOf(buyer, tokenId), 1, "buyer balance");
        assertEq(ticketing.balanceOf(reseller, tokenId), 0, "seller balance");
        // Ownership record updated to the buyer.
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 0), buyer, "serial owner updated");
        // Seller received the resale price; buyer paid it.
        assertEq(reseller.balance, sellerBefore + resalePrice, "seller payout");
        assertEq(buyer.balance, buyerBefore - resalePrice, "buyer paid");
    }

    function test_resellTicket_revertsAboveCap() public {
        _seedAndBuyNative(1 ether, 2 ether, reseller);

        vm.deal(buyer, 3 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.ResaleAboveCap.selector);
        ticketing.resellTicket{value: 3 ether}(EVENT_ID, TIER, 0, buyer, 3 ether);
    }

    function test_resellTicket_revertsWhenSerialNotOwned() public {
        // Seed tier but never sell serial 0 (no owner recorded).
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, 1 ether, 2 ether, address(0));
        vm.stopPrank();

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.NotSerialOwner.selector);
        ticketing.resellTicket{value: 1 ether}(EVENT_ID, TIER, 0, buyer, 1 ether);
    }

    function test_resellTicket_revertsWhenBuyerNotCaller() public {
        _seedAndBuyNative(1 ether, 2 ether, reseller);

        // Caller (stranger) does not match the declared buyer.
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(EventTicketing.InvalidBuyer.selector);
        ticketing.resellTicket{value: 1 ether}(EVENT_ID, TIER, 0, buyer, 1 ether);
    }

    function test_resellTicket_revertsWhenBuyerIsSeller() public {
        _seedAndBuyNative(1 ether, 2 ether, reseller);

        // Seller attempts to buy their own ticket back.
        vm.deal(reseller, 1 ether);
        vm.prank(reseller);
        vm.expectRevert(EventTicketing.InvalidBuyer.selector);
        ticketing.resellTicket{value: 1 ether}(EVENT_ID, TIER, 0, reseller, 1 ether);
    }

    function test_resellTicket_revertsWhenNativeValueMismatch() public {
        _seedAndBuyNative(1 ether, 2 ether, reseller);

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.IncorrectResaleValue.selector);
        ticketing.resellTicket{value: 2 ether}(EVENT_ID, TIER, 0, buyer, 1 ether);
    }

    // ------------------------------------------------------------------
    // resellTicket — ERC-20
    // ------------------------------------------------------------------

    function test_resellTicket_erc20WithinCapPaysSeller() public {
        MockERC20 token = new MockERC20();
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, 10e18, 20e18, address(token));
        vm.stopPrank();
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        // Seller buys a ticket with ERC-20.
        token.mint(reseller, 10e18);
        vm.startPrank(reseller);
        token.approve(address(ticketing), 10e18);
        ticketing.buyTicket(EVENT_ID, TIER, 1);
        vm.stopPrank();

        // Buyer approves the contract to pull the resale price straight to seller,
        // then submits the resale tx.
        uint256 resalePrice = 15e18;
        token.mint(buyer, resalePrice);
        vm.startPrank(buyer);
        token.approve(address(ticketing), resalePrice);
        vm.expectEmit(true, true, false, true);
        emit TicketResold(EVENT_ID, TIER, 0, reseller, buyer, resalePrice);
        ticketing.resellTicket(EVENT_ID, TIER, 0, buyer, resalePrice);
        vm.stopPrank();

        assertEq(ticketing.balanceOf(buyer, tokenId), 1, "buyer balance");
        assertEq(ticketing.serialOwner(EVENT_ID, TIER, 0), buyer, "serial owner updated");
        assertEq(token.balanceOf(reseller), resalePrice, "seller received resale price");
        assertEq(token.balanceOf(buyer), 0, "buyer paid");
    }

    function test_resellTicket_erc20RevertsWhenNativeValueSent() public {
        MockERC20 token = new MockERC20();
        vm.startPrank(organizer);
        ticketing.createEvent(EVENT_ID);
        ticketing.addTier(EVENT_ID, TIER, 100, 10e18, 20e18, address(token));
        vm.stopPrank();

        token.mint(reseller, 10e18);
        vm.startPrank(reseller);
        token.approve(address(ticketing), 10e18);
        ticketing.buyTicket(EVENT_ID, TIER, 1);
        vm.stopPrank();

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.IncorrectResaleValue.selector);
        ticketing.resellTicket{value: 1 ether}(EVENT_ID, TIER, 0, buyer, 15e18);
    }

    // ------------------------------------------------------------------
    // setGateStaff / validateTicket (R4)
    // ------------------------------------------------------------------

    address internal gateStaff = makeAddr("gateStaff");

    /// @dev Seeds a native tier, sells serial 0 to `buyer`, and authorizes
    ///      `gateStaff` on the event.
    function _seedBuyAndStaff() internal returns (uint256 tokenId) {
        tokenId = _seedAndBuyNative(1 ether, 2 ether, buyer);
        vm.prank(organizer);
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);
    }

    function test_setGateStaff_grantsAndRevokes() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.prank(organizer);
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);
        assertTrue(ticketing.isGateStaff(EVENT_ID, gateStaff), "granted");

        vm.prank(organizer);
        ticketing.setGateStaff(EVENT_ID, gateStaff, false);
        assertFalse(ticketing.isGateStaff(EVENT_ID, gateStaff), "revoked");
    }

    function test_setGateStaff_revertsWhenCallerNotOrganizer() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);

        vm.prank(stranger);
        vm.expectRevert(EventTicketing.NotOrganizer.selector);
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);
    }

    function test_setGateStaff_revertsForUnknownEvent() public {
        vm.prank(organizer);
        vm.expectRevert(EventTicketing.EventNotFound.selector);
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);
    }

    function test_validateTicket_staffMarksUsedAndEmits() public {
        _seedBuyAndStaff();

        vm.prank(gateStaff);
        vm.expectEmit(true, true, false, true);
        emit TicketValidated(EVENT_ID, TIER, 0, buyer, gateStaff);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);

        assertTrue(ticketing.isUsed(EVENT_ID, TIER, 0), "serial marked used");
        assertTrue(ticketing.isTicketUsed(EVENT_ID, TIER, 0), "mapping set");
    }

    function test_validateTicket_revertsWhenCallerNotStaff() public {
        _seedBuyAndStaff();

        // A revoked / never-authorized address cannot validate.
        vm.prank(stranger);
        vm.expectRevert(EventTicketing.NotGateStaff.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    function test_validateTicket_revertsOnDoubleValidation() public {
        _seedBuyAndStaff();

        vm.prank(gateStaff);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);

        // Second validation of the same serial must revert.
        vm.prank(gateStaff);
        vm.expectRevert(EventTicketing.AlreadyUsed.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    function test_validateTicket_revertsOnOwnerMismatch() public {
        _seedBuyAndStaff();

        // Claimed owner differs from the recorded serial owner.
        vm.prank(gateStaff);
        vm.expectRevert(EventTicketing.OwnerMismatch.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, stranger);
    }

    function test_validateTicket_revertsForUnknownEvent() public {
        vm.prank(gateStaff);
        vm.expectRevert(EventTicketing.EventNotFound.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    function test_validateTicket_revertsForUnknownTier() public {
        vm.prank(organizer);
        ticketing.createEvent(EVENT_ID);
        vm.prank(organizer);
        ticketing.setGateStaff(EVENT_ID, gateStaff, true);

        vm.prank(gateStaff);
        vm.expectRevert(EventTicketing.TierNotFound.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    // ------------------------------------------------------------------
    // Scanner read views (R4)
    // ------------------------------------------------------------------

    function test_ownerOfSerial_reflectsCurrentOwner() public {
        _seedAndBuyNative(1 ether, 2 ether, buyer);

        assertEq(ticketing.ownerOfSerial(EVENT_ID, TIER, 0), buyer, "sold serial");
        assertEq(ticketing.ownerOfSerial(EVENT_ID, TIER, 1), address(0), "unsold serial");
    }

    function test_isUsed_defaultsFalseThenTrueAfterValidation() public {
        _seedBuyAndStaff();

        assertFalse(ticketing.isUsed(EVENT_ID, TIER, 0), "unused initially");

        vm.prank(gateStaff);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);

        assertTrue(ticketing.isUsed(EVENT_ID, TIER, 0), "used after validation");
    }

    // ------------------------------------------------------------------
    // withdraw (R5)
    // ------------------------------------------------------------------

    function test_withdraw_nativeTransfersProceedsAndZeroesBalance() public {
        // Organizer sells 3 native tickets at 1 ether each.
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 3 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 3 ether}(EVENT_ID, TIER, 3);

        assertEq(ticketing.proceeds(EVENT_ID, address(0)), 3 ether, "proceeds accrued");
        uint256 orgBefore = organizer.balance;

        vm.prank(organizer);
        vm.expectEmit(true, true, true, true);
        emit Withdrawn(EVENT_ID, address(0), organizer, 3 ether);
        ticketing.withdraw(EVENT_ID, address(0));

        assertEq(organizer.balance, orgBefore + 3 ether, "organizer received native");
        assertEq(ticketing.proceeds(EVENT_ID, address(0)), 0, "balance zeroed");
        assertEq(address(ticketing).balance, 0, "contract drained");
    }

    function test_withdraw_erc20TransfersProceedsAndZeroesBalance() public {
        MockERC20 token = _seedErc20Tier(100, 10e18);
        token.mint(buyer, 100e18);
        vm.startPrank(buyer);
        token.approve(address(ticketing), 20e18);
        ticketing.buyTicket(EVENT_ID, TIER, 2);
        vm.stopPrank();

        assertEq(ticketing.proceeds(EVENT_ID, address(token)), 20e18, "proceeds accrued");

        vm.prank(organizer);
        vm.expectEmit(true, true, true, true);
        emit Withdrawn(EVENT_ID, address(token), organizer, 20e18);
        ticketing.withdraw(EVENT_ID, address(token));

        assertEq(token.balanceOf(organizer), 20e18, "organizer received ERC-20");
        assertEq(ticketing.proceeds(EVENT_ID, address(token)), 0, "balance zeroed");
        assertEq(token.balanceOf(address(ticketing)), 0, "contract drained");
    }

    function test_withdraw_revertsWhenCallerNotOrganizer() public {
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);

        vm.prank(stranger);
        vm.expectRevert(EventTicketing.NotOrganizer.selector);
        ticketing.withdraw(EVENT_ID, address(0));
    }

    function test_withdraw_revertsForUnknownEvent() public {
        vm.prank(organizer);
        vm.expectRevert(EventTicketing.EventNotFound.selector);
        ticketing.withdraw(EVENT_ID, address(0));
    }

    function test_withdraw_revertsWhenNothingToWithdraw() public {
        _seedNativeTier(100, 1 ether);

        vm.prank(organizer);
        vm.expectRevert(EventTicketing.NothingToWithdraw.selector);
        ticketing.withdraw(EVENT_ID, address(0));
    }

    function test_withdraw_secondWithdrawRevertsAfterBalanceZeroed() public {
        _seedNativeTier(100, 1 ether);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);

        vm.prank(organizer);
        ticketing.withdraw(EVENT_ID, address(0));

        // Ledger is zero now; a second withdraw must revert.
        vm.prank(organizer);
        vm.expectRevert(EventTicketing.NothingToWithdraw.selector);
        ticketing.withdraw(EVENT_ID, address(0));
    }

    function test_withdraw_reentrancyAttemptReverts() public {
        // Deploy an organizer contract that re-enters withdraw on native receive.
        ReentrantOrganizer evilOrg = new ReentrantOrganizer();
        evilOrg.setTarget(ticketing, EVENT_ID);
        evilOrg.createEvent(EVENT_ID);
        evilOrg.addTier(EVENT_ID, TIER, 100, 1 ether, 1 ether, address(0));

        vm.deal(buyer, 2 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 2 ether}(EVENT_ID, TIER, 2);

        // The re-entrant withdraw triggered inside receive() must cause the whole
        // withdrawal to revert (nonReentrant guard blocks it).
        vm.expectRevert();
        evilOrg.doWithdraw();

        // Proceeds remain intact because the reverting tx rolled back the zeroing.
        assertEq(ticketing.proceeds(EVENT_ID, address(0)), 2 ether, "proceeds preserved on revert");
    }

    // ------------------------------------------------------------------
    // Exploit vectors (R6)
    // ------------------------------------------------------------------

    /// @dev There is no public mint entrypoint: a stranger cannot obtain tickets
    ///      without paying through buyTicket. The ERC-1155 surface exposes no
    ///      externally reachable `mint`, so an attacker's only path is buyTicket,
    ///      which requires exact payment and decrements supply.
    function test_exploit_noPublicMintForStranger() public {
        _seedNativeTier(100, 1 ether);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        // Stranger has no tickets and cannot conjure them without paying.
        assertEq(ticketing.balanceOf(stranger, tokenId), 0, "no free balance");

        // Attempting to buy without sending value reverts (native tier).
        vm.prank(stranger);
        vm.expectRevert(EventTicketing.InsufficientPayment.selector);
        ticketing.buyTicket(EVENT_ID, TIER, 1);

        // Supply is untouched by the failed attempt.
        (, uint256 minted,,,,) = ticketing.tiers(EVENT_ID, TIER);
        assertEq(minted, 0, "supply unaffected");
    }

    function test_exploit_directTransferBypassBlocked() public {
        _seedNativeTier(100, 1 ether);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        ticketing.buyTicket{value: 1 ether}(EVENT_ID, TIER, 1);

        // Even with explicit operator approval, a direct transfer is blocked:
        // the only P2P path is resellTicket.
        vm.prank(buyer);
        ticketing.setApprovalForAll(reseller, true);

        vm.prank(reseller);
        vm.expectRevert(EventTicketing.DirectTransferBlocked.selector);
        ticketing.safeTransferFrom(buyer, reseller, tokenId, 1, "");
    }

    function test_exploit_resaleAboveCapBlocked() public {
        // Cap equals price (1 ether); any resale above it must revert.
        _seedAndBuyNative(1 ether, 1 ether, reseller);

        vm.deal(buyer, 5 ether);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.ResaleAboveCap.selector);
        ticketing.resellTicket{value: 5 ether}(EVENT_ID, TIER, 0, buyer, 5 ether);
    }

    function test_exploit_doubleValidationBlocked() public {
        _seedBuyAndStaff();

        vm.prank(gateStaff);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);

        vm.prank(gateStaff);
        vm.expectRevert(EventTicketing.AlreadyUsed.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    function test_exploit_unauthorizedValidationBlocked() public {
        _seedBuyAndStaff();

        // Neither a stranger nor the ticket owner (without staff role) can validate.
        vm.prank(stranger);
        vm.expectRevert(EventTicketing.NotGateStaff.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);

        vm.prank(buyer);
        vm.expectRevert(EventTicketing.NotGateStaff.selector);
        ticketing.validateTicket(EVENT_ID, TIER, 0, buyer);
    }

    // ------------------------------------------------------------------
    // Fuzz — prices & quantities (R6)
    // ------------------------------------------------------------------

    /// @dev Buying `quantity` native tickets at `price` each mints exactly that
    ///      many, assigns sequential serials, and credits proceeds precisely.
    function testFuzz_buyTicket_nativePriceAndQuantity(uint256 price, uint256 quantity) public {
        price = bound(price, 0, 1_000 ether);
        quantity = bound(quantity, 1, 500);
        uint256 total = price * quantity;

        _seedNativeTier(500, price);
        uint256 tokenId = uint256(keccak256(abi.encodePacked(EVENT_ID, TIER)));

        vm.deal(buyer, total);
        vm.prank(buyer);
        ticketing.buyTicket{value: total}(EVENT_ID, TIER, quantity);

        assertEq(ticketing.balanceOf(buyer, tokenId), quantity, "minted quantity");
        assertEq(ticketing.nextSerial(EVENT_ID, TIER), quantity, "serials advanced");
        (, uint256 minted,,,,) = ticketing.tiers(EVENT_ID, TIER);
        assertEq(minted, quantity, "minted counter");
        assertEq(ticketing.proceeds(EVENT_ID, address(0)), total, "proceeds credited");
    }

    /// @dev Any native value that is not exactly price*quantity reverts.
    function testFuzz_buyTicket_wrongNativeValueReverts(uint256 price, uint256 quantity, uint256 sent) public {
        price = bound(price, 1, 1_000 ether);
        quantity = bound(quantity, 1, 100);
        uint256 total = price * quantity;
        sent = bound(sent, 0, total * 2);
        vm.assume(sent != total);

        _seedNativeTier(100, price);

        vm.deal(buyer, sent);
        vm.prank(buyer);
        vm.expectRevert(EventTicketing.InsufficientPayment.selector);
        ticketing.buyTicket{value: sent}(EVENT_ID, TIER, quantity);
    }

    /// @dev A resale at or below the cap always succeeds and pays the seller;
    ///      above the cap always reverts.
    function testFuzz_resellTicket_capBoundary(uint256 cap, uint256 price) public {
        cap = bound(cap, 1, 1_000 ether);
        uint256 basePrice = 1; // primary price; cap >= price required by addTier
        cap = cap < basePrice ? basePrice : cap;
        price = bound(price, 0, cap * 2);

        uint256 tokenId = _seedAndBuyNative(basePrice, cap, reseller);

        vm.deal(buyer, price);
        vm.prank(buyer);
        if (price > cap) {
            vm.expectRevert(EventTicketing.ResaleAboveCap.selector);
            ticketing.resellTicket{value: price}(EVENT_ID, TIER, 0, buyer, price);
        } else {
            uint256 sellerBefore = reseller.balance;
            ticketing.resellTicket{value: price}(EVENT_ID, TIER, 0, buyer, price);
            assertEq(ticketing.balanceOf(buyer, tokenId), 1, "buyer owns ticket");
            assertEq(ticketing.serialOwner(EVENT_ID, TIER, 0), buyer, "owner updated");
            assertEq(reseller.balance, sellerBefore + price, "seller paid");
        }
    }
}
