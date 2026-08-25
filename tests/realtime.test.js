import assert from "node:assert/strict";
import test from "node:test";

import { BoxRealtime, REALTIME_STATUS } from "../src/realtime.js";

function makeChannel() {
  const changes = [];
  const statuses = [];
  const channel = new BoxRealtime({
    onChange: (change) => changes.push(change),
    onStatus: (status) => statuses.push(status)
  });
  channel.topic = "realtime:butbox:space-1";
  return { channel, changes, statuses };
}

test("an insert event is delivered with its record", () => {
  const { channel, changes } = makeChannel();
  channel.handleMessage(
    JSON.stringify({
      topic: "realtime:butbox:space-1",
      event: "postgres_changes",
      payload: { data: { eventType: "INSERT", new: { id: "box-1", name: "환불 안내" } } }
    })
  );
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "INSERT");
  assert.equal(changes[0].record.name, "환불 안내");
});

test("a delete event carries the previous record so the row can be removed", () => {
  const { channel, changes } = makeChannel();
  channel.handleMessage(
    JSON.stringify({
      topic: "realtime:butbox:space-1",
      event: "postgres_changes",
      payload: { data: { eventType: "DELETE", old: { id: "box-9" } } }
    })
  );
  assert.equal(changes[0].type, "DELETE");
  assert.equal(changes[0].previous.id, "box-9");
});

test("the raw wire format with type and record is understood too", () => {
  const { channel, changes } = makeChannel();
  channel.handleMessage(
    JSON.stringify({
      topic: "realtime:butbox:space-1",
      event: "postgres_changes",
      payload: { data: { type: "UPDATE", record: { id: "box-2" }, old_record: { id: "box-2" } } }
    })
  );
  assert.equal(changes[0].type, "UPDATE");
  assert.equal(changes[0].record.id, "box-2");
});

test("a successful subscribe reply flips the indicator to live", () => {
  const { channel, statuses } = makeChannel();
  channel.handleMessage(
    JSON.stringify({
      topic: "realtime:butbox:space-1",
      event: "phx_reply",
      payload: { status: "ok", response: {} }
    })
  );
  assert.ok(statuses.includes(REALTIME_STATUS.live));
});

test("malformed payloads never throw", () => {
  const { channel, changes } = makeChannel();
  assert.doesNotThrow(() => channel.handleMessage("this is not json"));
  assert.doesNotThrow(() => channel.handleMessage(JSON.stringify({ event: "postgres_changes" })));
  assert.doesNotThrow(() =>
    channel.handleMessage(JSON.stringify({ event: "postgres_changes", payload: { data: {} } }))
  );
  assert.equal(changes.length, 0);
});

test("a channel with no space never schedules a reconnect", () => {
  const { channel, statuses } = makeChannel();
  channel.spaceId = null;
  channel.scheduleReconnect();
  assert.equal(channel.reconnectTimer, null);
  assert.ok(!statuses.includes(REALTIME_STATUS.retrying));
});

test("reconnect backoff grows and stays bounded", () => {
  const { channel } = makeChannel();
  channel.spaceId = "space-1";
  channel.closedByUs = false;

  const delays = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay) => {
    delays.push(delay);
    return realSetTimeout(() => {}, 0);
  };
  try {
    for (let i = 0; i < 8; i += 1) {
      channel.reconnectTimer = null;
      channel.scheduleReconnect();
    }
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  assert.ok(delays[1] > delays[0], "지연이 늘어나야 합니다.");
  assert.ok(Math.max(...delays) <= 20000, "지연 상한을 넘으면 안 됩니다.");
  channel.stop();
});

test("stopping marks the channel closed so it does not silently reconnect", () => {
  const { channel } = makeChannel();
  channel.spaceId = "space-1";
  channel.stop();
  assert.equal(channel.closedByUs, true);
  assert.equal(channel.reconnectTimer, null);
});

test("suspend keeps the space so resume can reconnect to the same one", () => {
  const { channel } = makeChannel();
  channel.spaceId = "space-7";
  channel.suspend();
  assert.equal(channel.spaceId, "space-7");
  assert.equal(channel.socket, null);
});
