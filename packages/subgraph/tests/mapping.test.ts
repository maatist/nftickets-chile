import {
  assert,
  clearStore,
  describe,
  test,
  afterEach,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  EventCreated,
  TicketPurchased,
} from "../generated/EventTicketing/EventTicketing";
import {
  handleEventCreated,
  handleTicketPurchased,
} from "../src/mapping";

const ORGANIZER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const BUYER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

function createEventCreatedEvent(
  eventId: i32,
  organizer: string,
): EventCreated {
  const mockEvent = newMockEvent();
  const created = new EventCreated(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
    mockEvent.receipt,
  );
  created.parameters = new Array();
  created.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(eventId)),
    ),
  );
  created.parameters.push(
    new ethereum.EventParam(
      "organizer",
      ethereum.Value.fromAddress(Address.fromString(organizer)),
    ),
  );
  return created;
}

function createTicketPurchasedEvent(
  eventId: i32,
  tier: i32,
  buyer: string,
  quantity: i32,
  startSerial: i32,
): TicketPurchased {
  const mockEvent = newMockEvent();
  const purchased = new TicketPurchased(
    mockEvent.address,
    mockEvent.logIndex,
    mockEvent.transactionLogIndex,
    mockEvent.logType,
    mockEvent.block,
    mockEvent.transaction,
    mockEvent.parameters,
    mockEvent.receipt,
  );
  purchased.parameters = new Array();
  purchased.parameters.push(
    new ethereum.EventParam(
      "eventId",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(eventId)),
    ),
  );
  purchased.parameters.push(
    new ethereum.EventParam(
      "tier",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(tier)),
    ),
  );
  purchased.parameters.push(
    new ethereum.EventParam(
      "buyer",
      ethereum.Value.fromAddress(Address.fromString(buyer)),
    ),
  );
  purchased.parameters.push(
    new ethereum.EventParam(
      "quantity",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(quantity)),
    ),
  );
  purchased.parameters.push(
    new ethereum.EventParam(
      "startSerial",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(startSerial)),
    ),
  );
  return purchased;
}

describe("EventTicketing mappings", () => {
  afterEach(() => {
    clearStore();
  });

  test("handleEventCreated stores an Event entity", () => {
    handleEventCreated(createEventCreatedEvent(1, ORGANIZER));

    assert.entityCount("Event", 1);
    assert.fieldEquals("Event", "1", "eventId", "1");
    assert.fieldEquals("Event", "1", "organizer", ORGANIZER);
  });

  test("handleTicketPurchased mints one Ticket per sequential serial", () => {
    // startSerial = 10, quantity = 3 -> serials 10, 11, 12
    handleTicketPurchased(
      createTicketPurchasedEvent(1, 0, BUYER, 3, 10),
    );

    assert.entityCount("Ticket", 3);
    assert.fieldEquals("Ticket", "1-0-10", "serial", "10");
    assert.fieldEquals("Ticket", "1-0-11", "serial", "11");
    assert.fieldEquals("Ticket", "1-0-12", "serial", "12");
    assert.fieldEquals("Ticket", "1-0-10", "owner", BUYER);
    assert.fieldEquals("Ticket", "1-0-10", "used", "false");
  });
});
