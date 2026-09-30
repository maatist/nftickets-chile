// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title EventTicketing
/// @notice ERC-1155 event ticketing with per-(eventId, tier) serial tracking.
/// @dev Task 2 scope: event/tier creation. Purchase, resale, validation, and
///      withdrawal are layered on in later tasks. State declared here (serial
///      tracking, gate staff, proceeds ledger, resale flag) is intentionally
///      present so those tasks extend rather than restructure this contract.
contract EventTicketing is ERC1155, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice Caller is not the organizer of the referenced event.
    error NotOrganizer();
    /// @notice An event with the given id already exists.
    error EventExists();
    /// @notice The referenced event does not exist.
    error EventNotFound();
    /// @notice A tier with the given id already exists for the event.
    error TierExists();
    /// @notice `maxSupply` must be greater than zero.
    error InvalidSupply();
    /// @notice `maxResalePrice` must be greater than or equal to `price`.
    error InvalidResaleCap();
    /// @notice The referenced tier does not exist.
    error TierNotFound();
    /// @notice `quantity` must be greater than zero.
    error InvalidQuantity();
    /// @notice Requested quantity exceeds remaining supply for the tier.
    error SoldOut();
    /// @notice Native value sent does not cover the required total price.
    error InsufficientPayment();
    /// @notice A direct transfer was attempted outside the allowed exceptions.
    error DirectTransferBlocked();
    /// @notice Resale `price` exceeds the tier `maxResalePrice`.
    error ResaleAboveCap();
    /// @notice Caller is not the recorded owner of the serial being resold.
    error NotSerialOwner();
    /// @notice The seller cannot resell a ticket to themselves.
    error InvalidBuyer();
    /// @notice The serial has already been used and cannot be resold.
    error TicketAlreadyUsed();
    /// @notice Native value sent does not match the resale price.
    error IncorrectResaleValue();
    /// @notice Caller is not authorized gate staff for the event.
    error NotGateStaff();
    /// @notice The serial has already been validated at the gate.
    error AlreadyUsed();
    /// @notice The claimed ticket owner does not match the recorded serial owner.
    error OwnerMismatch();
    /// @notice There are no proceeds to withdraw for the given event and token.
    error NothingToWithdraw();
    /// @notice A native withdrawal transfer to the organizer failed.
    error WithdrawFailed();

    // ---------------------------------------------------------------------
    // Data model
    // ---------------------------------------------------------------------

    struct EventInfo {
        address organizer;
        bool active;
        bool exists;
    }

    struct TierInfo {
        uint256 maxSupply;
        uint256 minted;
        uint256 price;
        uint256 maxResalePrice;
        address payToken; // address(0) => native
        bool exists;
    }

    /// @notice eventId => event info.
    mapping(uint256 => EventInfo) public events;

    /// @notice eventId => tier => tier info.
    mapping(uint256 => mapping(uint256 => TierInfo)) public tiers;

    /// @notice eventId => tier => next serial to assign.
    mapping(uint256 => mapping(uint256 => uint256)) public nextSerial;

    /// @notice eventId => tier => serial => owner.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => address))) public serialOwner;

    /// @notice eventId => tier => serial => used flag.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public isTicketUsed;

    /// @notice eventId => address => gate-staff authorization.
    mapping(uint256 => mapping(address => bool)) public isGateStaff;

    /// @notice eventId => token (address(0)=native) => accumulated proceeds.
    mapping(uint256 => mapping(address => uint256)) public proceeds;

    /// @dev Transient flag permitting transfers initiated by resellTicket.
    bool internal _resaleInProgress;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

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

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param uri_ Base ERC-1155 metadata URI.
    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    // ---------------------------------------------------------------------
    // Event & tier creation (R1)
    // ---------------------------------------------------------------------

    /// @notice Register a new event with the caller as its organizer.
    /// @param eventId Unique event identifier.
    function createEvent(uint256 eventId) external {
        if (events[eventId].exists) revert EventExists();

        events[eventId] = EventInfo({organizer: msg.sender, active: true, exists: true});

        emit EventCreated(eventId, msg.sender);
    }

    /// @notice Add a ticket tier to an event owned by the caller.
    /// @param eventId Event to add the tier to.
    /// @param tier Tier identifier, unique within the event.
    /// @param maxSupply Maximum number of tickets for the tier (must be > 0).
    /// @param price Primary sale price per ticket.
    /// @param maxResalePrice Resale price cap (must be >= price).
    /// @param payToken Settlement token; address(0) means native.
    function addTier(
        uint256 eventId,
        uint256 tier,
        uint256 maxSupply,
        uint256 price,
        uint256 maxResalePrice,
        address payToken
    ) external {
        EventInfo storage e = events[eventId];
        if (!e.exists) revert EventNotFound();
        if (e.organizer != msg.sender) revert NotOrganizer();
        if (tiers[eventId][tier].exists) revert TierExists();
        if (maxSupply == 0) revert InvalidSupply();
        if (maxResalePrice < price) revert InvalidResaleCap();

        tiers[eventId][tier] = TierInfo({
            maxSupply: maxSupply,
            minted: 0,
            price: price,
            maxResalePrice: maxResalePrice,
            payToken: payToken,
            exists: true
        });

        emit TierAdded(eventId, tier, maxSupply, price, maxResalePrice, payToken);
    }

    // ---------------------------------------------------------------------
    // Ticket purchase (R2)
    // ---------------------------------------------------------------------

    /// @notice Purchase one or more tickets for a tier, paying in native or ERC-20.
    /// @dev Native tiers (`payToken == address(0)`) require exact `msg.value`.
    ///      ERC-20 tiers pull `price * quantity` via `SafeERC20.safeTransferFrom`.
    ///      Serials are assigned sequentially per (eventId, tier) and the tokens
    ///      are batch-minted in a single ERC-1155 mint. Proceeds are credited to
    ///      the per-event ledger keyed by the tier's settlement token.
    /// @param eventId Event to buy from.
    /// @param tier Tier within the event.
    /// @param quantity Number of tickets to purchase (must be > 0).
    function buyTicket(uint256 eventId, uint256 tier, uint256 quantity) external payable nonReentrant {
        if (!events[eventId].exists) revert EventNotFound();

        TierInfo storage t = tiers[eventId][tier];
        if (!t.exists) revert TierNotFound();
        if (quantity == 0) revert InvalidQuantity();
        if (t.minted + quantity > t.maxSupply) revert SoldOut();

        uint256 total = t.price * quantity;
        address payToken = t.payToken;

        // Collect payment before mutating supply/ownership state.
        if (payToken == address(0)) {
            if (msg.value != total) revert InsufficientPayment();
        } else {
            if (msg.value != 0) revert InsufficientPayment();
            IERC20(payToken).safeTransferFrom(msg.sender, address(this), total);
        }

        // Assign sequential serials and record ownership.
        uint256 startSerial = nextSerial[eventId][tier];
        for (uint256 i = 0; i < quantity; ++i) {
            serialOwner[eventId][tier][startSerial + i] = msg.sender;
        }
        nextSerial[eventId][tier] = startSerial + quantity;
        t.minted += quantity;

        // Credit proceeds ledger and batch-mint the fungible units.
        proceeds[eventId][payToken] += total;
        _mint(msg.sender, _tokenId(eventId, tier), quantity, "");

        emit TicketPurchased(eventId, tier, msg.sender, quantity, startSerial);
    }

    // ---------------------------------------------------------------------
    // Anti-scalping resale (R3)
    // ---------------------------------------------------------------------

    /// @notice Buy a single ticket on the secondary market at a capped price.
    /// @dev Payment-flow model: the resale is agreed off-chain (the current
    ///      holder names a `buyer` and a `price`), and the **buyer** submits
    ///      this transaction so their funds actually settle on-chain. The
    ///      `buyer` parameter is therefore required to equal `msg.sender`; the
    ///      seller is the recorded `serialOwner` of the serial. Keeping the
    ///      buyer as the caller is the only arrangement in which native payment
    ///      works: msg.value cannot originate from a third party. The resale cap
    ///      is enforced against the tier's `maxResalePrice` before any token or
    ///      value movement. Exactly one fungible unit is transferred from seller
    ///      to buyer through the resale flag (the only holder-to-holder path
    ///      `_update` permits), the serial's owner record is updated to the
    ///      buyer, and payment is routed straight to the seller: native tiers
    ///      require `msg.value == price` and forward it to the seller; ERC-20
    ///      tiers pull `price` from the buyer to the seller via
    ///      `SafeERC20.safeTransferFrom` (buyer must approve this contract).
    ///      Resale proceeds bypass the organizer ledger — they belong to the
    ///      seller, not the event.
    /// @param eventId Event of the ticket.
    /// @param tier Tier of the ticket.
    /// @param serial Serial being resold.
    /// @param buyer Recipient of the ticket and payer; must equal `msg.sender`.
    /// @param price Sale price; must be <= tier `maxResalePrice`.
    function resellTicket(uint256 eventId, uint256 tier, uint256 serial, address buyer, uint256 price)
        external
        payable
        nonReentrant
    {
        if (!events[eventId].exists) revert EventNotFound();

        TierInfo storage t = tiers[eventId][tier];
        if (!t.exists) revert TierNotFound();

        // The buyer submits the transaction so their funds settle on-chain.
        if (buyer != msg.sender) revert InvalidBuyer();

        address seller = serialOwner[eventId][tier][serial];
        if (seller == address(0)) revert NotSerialOwner();
        if (buyer == seller) revert InvalidBuyer();
        if (isTicketUsed[eventId][tier][serial]) revert TicketAlreadyUsed();

        // Enforce the resale cap before moving any tokens or value.
        if (price > t.maxResalePrice) revert ResaleAboveCap();

        // Transfer exactly one fungible unit via the resale-permitted path.
        uint256 tokenId = _tokenId(eventId, tier);
        _resaleInProgress = true;
        _safeTransferFrom(seller, buyer, tokenId, 1, "");
        _resaleInProgress = false;

        // Update the serial-to-owner association to the buyer.
        serialOwner[eventId][tier][serial] = buyer;

        // Route payment directly to the seller.
        if (t.payToken == address(0)) {
            if (msg.value != price) revert IncorrectResaleValue();
            (bool ok,) = payable(seller).call{value: price}("");
            if (!ok) revert IncorrectResaleValue();
        } else {
            if (msg.value != 0) revert IncorrectResaleValue();
            IERC20(t.payToken).safeTransferFrom(buyer, seller, price);
        }

        emit TicketResold(eventId, tier, serial, seller, buyer, price);
    }

    // ---------------------------------------------------------------------
    // Gate validation & gate-staff roles (R4)
    // ---------------------------------------------------------------------

    /// @notice Grant or revoke gate-staff authorization for an address on an event.
    /// @dev Organizer-only. Setting `authorized` to false revokes access.
    /// @param eventId Event whose gate staff is being managed.
    /// @param staff Address to authorize or revoke.
    /// @param authorized True to grant, false to revoke.
    function setGateStaff(uint256 eventId, address staff, bool authorized) external {
        EventInfo storage e = events[eventId];
        if (!e.exists) revert EventNotFound();
        if (e.organizer != msg.sender) revert NotOrganizer();

        isGateStaff[eventId][staff] = authorized;
    }

    /// @notice Validate a ticket at the gate, marking its serial as used.
    /// @dev Callable only by authorized gate staff for the event. Reverts if the
    ///      serial was already validated (double-validation prevention) or if the
    ///      claimed `ticketOwner` does not match the recorded serial owner. On
    ///      success the serial is flagged used and `TicketValidated` is emitted.
    /// @param eventId Event of the ticket.
    /// @param tier Tier of the ticket.
    /// @param serial Serial being validated.
    /// @param ticketOwner Claimed owner presented at the gate.
    function validateTicket(uint256 eventId, uint256 tier, uint256 serial, address ticketOwner) external {
        if (!events[eventId].exists) revert EventNotFound();
        if (!tiers[eventId][tier].exists) revert TierNotFound();
        if (!isGateStaff[eventId][msg.sender]) revert NotGateStaff();
        if (isTicketUsed[eventId][tier][serial]) revert AlreadyUsed();
        if (serialOwner[eventId][tier][serial] != ticketOwner) revert OwnerMismatch();

        isTicketUsed[eventId][tier][serial] = true;

        emit TicketValidated(eventId, tier, serial, ticketOwner, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Organizer fund withdrawal (R5)
    // ---------------------------------------------------------------------

    /// @notice Withdraw the accumulated proceeds for an event in a single token.
    /// @dev Organizer-only. Follows checks-effects-interactions: the recorded
    ///      balance is zeroed BEFORE any value/token movement, so a reentrant
    ///      call would observe a zero balance (in addition to the
    ///      `nonReentrant` guard). Native proceeds (`token == address(0)`) are
    ///      forwarded to the organizer via a raw `call`; ERC-20 proceeds are
    ///      sent with `SafeERC20.safeTransfer`. Reverts with
    ///      `NothingToWithdraw` when the balance is zero.
    /// @param eventId Event whose proceeds are being withdrawn.
    /// @param token Settlement token to withdraw; address(0) means native.
    function withdraw(uint256 eventId, address token) external nonReentrant {
        EventInfo storage e = events[eventId];
        if (!e.exists) revert EventNotFound();
        if (e.organizer != msg.sender) revert NotOrganizer();

        uint256 amount = proceeds[eventId][token];
        if (amount == 0) revert NothingToWithdraw();

        // Effects: zero the balance before interacting (checks-effects-interactions).
        proceeds[eventId][token] = 0;

        // Interactions: route funds to the organizer.
        if (token == address(0)) {
            (bool ok,) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert WithdrawFailed();
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit Withdrawn(eventId, token, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Scanner read views (R4)
    // ---------------------------------------------------------------------

    /// @notice Current recorded owner of a serial (address(0) if never sold).
    function ownerOfSerial(uint256 eventId, uint256 tier, uint256 serial) external view returns (address) {
        return serialOwner[eventId][tier][serial];
    }

    /// @notice Whether a serial has already been validated at the gate.
    function isUsed(uint256 eventId, uint256 tier, uint256 serial) external view returns (bool) {
        return isTicketUsed[eventId][tier][serial];
    }

    // ---------------------------------------------------------------------
    // Transfer enforcement (R3)
    // ---------------------------------------------------------------------

    /// @notice Anti-scalping transfer gate.
    /// @dev Overrides the ERC-1155 v5 `_update` hook. Mints (`from == 0`) and
    ///      burns (`to == 0`) are always allowed, as are transfers initiated by
    ///      `resellTicket` (while `_resaleInProgress` is set). Every other
    ///      holder-to-holder transfer — i.e. direct `safeTransferFrom` /
    ///      `safeBatchTransferFrom` — reverts with `DirectTransferBlocked`.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0) && !_resaleInProgress) {
            revert DirectTransferBlocked();
        }
        super._update(from, to, ids, values);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// @notice Deterministic ERC-1155 token id for an (eventId, tier) pair.
    function _tokenId(uint256 eventId, uint256 tier) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(eventId, tier)));
    }
}
