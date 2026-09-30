import { BigInt } from "@graphprotocol/graph-ts";
import {
  EventCreated,
  TierAdded,
  TicketPurchased,
  TicketResold,
  TicketValidated,
} from "../generated/EventTicketing/EventTicketing";
import { Event, Tier, Ticket, Validation } from "../generated/schema";

// ---------------------------------------------------------------------------
// ID helpers. All entity ids are strings (see schema.graphql).
// ---------------------------------------------------------------------------

function eventEntityId(eventId: BigInt): string {
  return eventId.toString();
}

function tierEntityId(eventId: BigInt, tier: BigInt): string {
  return eventId.toString() + "-" + tier.toString();
}

function ticketEntityId(eventId: BigInt, tier: BigInt, serial: BigInt): string {
  return (
    eventId.toString() + "-" + tier.toString() + "-" + serial.toString()
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleEventCreated(event: EventCreated): void {
  const id = eventEntityId(event.params.eventId);
  let entity = Event.load(id);
  if (entity == null) {
    entity = new Event(id);
  }
  entity.eventId = event.params.eventId;
  entity.organizer = event.params.organizer;
  entity.createdAt = event.block.timestamp;
  entity.save();
}

export function handleTierAdded(event: TierAdded): void {
  // Ensure the parent Event exists even if TierAdded is processed first
  // (defensive; on-chain TierAdded always follows EventCreated).
  const eventId = eventEntityId(event.params.eventId);
  let parent = Event.load(eventId);
  if (parent == null) {
    parent = new Event(eventId);
    parent.eventId = event.params.eventId;
    parent.organizer = event.transaction.from;
    parent.createdAt = event.block.timestamp;
    parent.save();
  }

  const id = tierEntityId(event.params.eventId, event.params.tier);
  let tier = Tier.load(id);
  if (tier == null) {
    tier = new Tier(id);
  }
  tier.event = eventId;
  tier.tier = event.params.tier;
  tier.maxSupply = event.params.maxSupply;
  tier.minted = BigInt.zero();
  tier.price = event.params.price;
  tier.maxResalePrice = event.params.maxResalePrice;
  tier.payToken = event.params.payToken;
  tier.save();
}

export function handleTicketPurchased(event: TicketPurchased): void {
  const eventId = eventEntityId(event.params.eventId);
  const tierId = tierEntityId(event.params.eventId, event.params.tier);

  // Bump the tier's minted counter by the purchased quantity.
  const tier = Tier.load(tierId);
  if (tier != null) {
    tier.minted = tier.minted.plus(event.params.quantity);
    tier.save();
  }

  // Mint `quantity` sequential serials: startSerial .. startSerial+quantity-1.
  const start = event.params.startSerial;
  const quantity = event.params.quantity;
  for (let i = BigInt.zero(); i.lt(quantity); i = i.plus(BigInt.fromI32(1))) {
    const serial = start.plus(i);
    const id = ticketEntityId(event.params.eventId, event.params.tier, serial);
    let ticket = Ticket.load(id);
    if (ticket == null) {
      ticket = new Ticket(id);
    }
    ticket.event = eventId;
    ticket.tier = tierId;
    ticket.serial = serial;
    ticket.owner = event.params.buyer;
    ticket.used = false;
    ticket.save();
  }
}

export function handleTicketResold(event: TicketResold): void {
  const id = ticketEntityId(
    event.params.eventId,
    event.params.tier,
    event.params.serial,
  );
  const ticket = Ticket.load(id);
  if (ticket != null) {
    ticket.owner = event.params.buyer;
    ticket.save();
  }
}

export function handleTicketValidated(event: TicketValidated): void {
  const id = ticketEntityId(
    event.params.eventId,
    event.params.tier,
    event.params.serial,
  );

  const ticket = Ticket.load(id);
  if (ticket != null) {
    ticket.used = true;
    ticket.save();
  }

  // One Validation per ticket; reuse the ticket id as the validation id.
  let validation = Validation.load(id);
  if (validation == null) {
    validation = new Validation(id);
  }
  validation.ticket = id;
  validation.ticketOwner = event.params.ticketOwner;
  validation.validator = event.params.validator;
  validation.timestamp = event.block.timestamp;
  validation.save();
}
