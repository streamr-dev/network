# Proposal: cutting per-message timer and microtask overhead in the RPC hot path

Status: PROPOSAL (2026-06-11) · Branch context: `iphone-fix` (103.7.0-rc.2)
Motivation: StreamrTV iPhone thermal-throttling work — the browser
networknode worker is the busiest thread in the app and its baseline load
is dominated by per-message RPC machinery.

## 1. Measurement

Safari timeline recording of a StreamrTV **guest** in steady state
(desktop Safari, 135 s, ~116 msg/s inbound + ~66 msg/s outbound on the
networknode worker — all data-plane `sendStreamMessage` notifications plus
DHT maintenance):

| Metric (networknode worker) | Measured |
|---|---|
| `timer-installed` events | **28 207 in 132 s ≈ 214/s** |
| `timer-removed` events | 27 781 (≈ every timer cleared before firing) |
| total time in fired timers | 161 ms (the timers do nothing 99.9 % of the time) |
| `microtask-dispatched` | **3 619/s** (564 939 script records total) |
| share of all script records in the recording | 69 % of 822 576 |

≈ 214 timers/s ≈ inbound message rate + outbound request rate, and
≈ 3 600 microtasks/s ≈ 20 microtasks per message at ~180 msg/s. Both
scale linearly with message rate — on a phone receiving a busy broadcast
this is the per-message floor, and it feeds GC pressure (every Deferred,
closure, and race wrapper is short-lived garbage).

## 2. Where it comes from — per-message anatomy

A single data-plane notification (`sendStreamMessage`) costs today:

**Sender side**
1. `toProtoRpcClient` proxy: `await obj[methodName].apply(...)` on a
   `UnaryCall` *thenable* (internally joins 4 promises).
2. `ClientTransport.unary` (`packages/proto-rpc/src/ClientTransport.ts:66`):
   - `Any.pack` of the payload
   - **`uuid v4` requestId** (crypto randomness + string formatting)
   - **4 `Deferred` objects** (header/message/status/trailer) + `UnaryCall`
   - `emit('rpcRequest', …)`
3. `RpcCommunicator.onOutgoingMessage`
   (`packages/proto-rpc/src/RpcCommunicator.ts:193`): notifications skip
   the timeout registration (good), but still get a
   **`.then` + `.catch` chain** on the outgoing listener promise, and on
   completion `resolveNotification()` **resolves all 4 Deferreds**, whose
   joined thenable the proxy is awaiting → several more microtasks.
4. `RoutingRpcCommunicator` outgoing listener
   (`packages/dht/src/transport/RoutingRpcCommunicator.ts:21`):
   - **a second `uuid v4`** (`messageId` of the wrapping `Message`)
   - wraps and calls `sendFn` → `ConnectionManager.send` (an `async`
     chain with ~11 `await` sites along the file; each `await` on an
     already-resolved value still costs ≥ 1 microtask tick).

**Receiver side**
5. `ListeningRpcCommunicator` transport listener → `handleMessageFromPeer`
   → floating `handleIncomingMessage` (async) → `handleNotification`.
6. `ServerRegistry.handleNotification`
   (`packages/proto-rpc/src/ServerRegistry.ts:81-87`):
   **every incoming notification and request is wrapped in
   `promiseTimeout(timeout, fn(...))`** (`common.ts:4`), which allocates
   a wrapper `Promise`, a **`setTimeout`**, a `.finally` + `.catch`
   chain, and a `Promise.race` — *per message*. This is the source of
   nearly all the 214 timer installs/s (≈ inbound rate), and each is
   cleared a few microseconds later when the handler resolves.
7. The registered wrapper `fn` (`ServerRegistry.ts:100-126`):
   `Any.unpack` + `await` user handler.

Nothing here is wire-format-related — it is all local-process machinery.
Two further facts make the per-message timeout especially low-value:

- `promiseTimeout` does **not cancel** the handler; it only rejects a
  promise early. For notifications the caller (`RpcCommunicator`
  `handleNotification` path) discards the result anyway — a timeout
  rejection changes nothing observable except the timing of a floating
  promise settling.
- The data-plane handler (`ContentDeliveryLayerNode.ts:214`,
  `sendStreamMessage`) is effectively synchronous message delivery; it
  cannot hang on I/O.

## 3. Proposed changes (ranked by win ÷ risk)

### P1 — Drop the per-message server-side timeout for notifications
**File**: `packages/proto-rpc/src/ServerRegistry.ts`
Replace `await promiseTimeout(timeout, implementation.fn(...))` in
`handleNotification` with a direct `await implementation.fn(...)`.
Optionally keep the timeout opt-in via `MethodOptions` for handlers that
genuinely do async work (none of the data-plane ones do).

- Eliminates ~1 timer install + clear, 2 promise allocations, and a race
  per **inbound** message (~116/s in the measured guest; more on busier
  meshes).
- Semantics: unchanged for all practical purposes (see §2). Requests
  (`handleRequest`) keep their timeout — they have a caller waiting.
- Risk: minimal. Effort: ~10 lines + tests.

### P2 — True fire-and-forget fast path for outgoing notifications
**Files**: `packages/proto-rpc/src/ClientTransport.ts`,
`RpcCommunicator.ts`, `toProtoRpcClient.ts`
Notifications never get a response, yet they pay the full unary-call
apparatus: 4 Deferreds + UnaryCall thenable + ongoing-request map checks
+ a `.then/.catch` pair + 4 resolutions joined by the proxy's `await`.

Add a notification path that:
1. packs the request (`Any.pack`) and builds the `RpcMessage` header,
2. emits it to the communicator,
3. returns a single shared resolved promise (or `void` — the
   `ContentDeliveryRpcRemote` call sites already `.catch` and discard).

`toProtoRpcClient` already knows which methods are notifications
(`toProtoRpcClient.ts:49` sets `options.notification = true`); route those
to the fast path. Delivery-failure logging that today rides the
`.catch` in `onOutgoingMessage` moves into the fast path's single
`sendFn(...).catch(...)`.

- Saves per **outbound** message: 4 Deferred allocations, the UnaryCall,
  the proxy's join-await, one `.then/.catch` chain — roughly half of the
  sender-side microtasks (~66/s × ~8-10 microtasks in the measured guest).
- Wire format: byte-identical.
- Risk: low-moderate (touchpoints in three files; behavior of *request*
  calls untouched). Effort: ~1 day incl. tests.

### P3 — One timeout wheel instead of one `setTimeout` per client request
**File**: `packages/proto-rpc/src/RpcCommunicator.ts:42`
Outgoing *requests* (DHT pings, routing, handshakes — the remaining
~50-100 timers/s under churn) each arm and clear their own `setTimeout`.
RPC timeouts (default 5 000 ms) need no millisecond precision: store a
`deadline` on each `OngoingRequest` and sweep `ongoingRequests` with a
**single repeating 500 ms interval** that rejects expired entries (the
map is already keyed and bounded). Start the interval lazily when the
map becomes non-empty, stop it when empty.

- Reduces timer installs from one per request to ~2/s total, regardless
  of load. Timeout accuracy becomes ±500 ms on a 5 s timeout —
  irrelevant.
- Risk: low. Effort: ~½ day. (P1 already removes the notification-side
  timers; P3 cleans up the rest.)

### P4 — Cheap message ids on the hot path
**Files**: `ClientTransport.ts:74` (`requestId`),
`RoutingRpcCommunicator.ts:31` (`messageId`)
Two `uuid v4` per outgoing message. For notifications the requestId is
never matched against anything (no response), and `messageId` only needs
process-lifetime uniqueness. Replace with
`prefix + (counter++).toString(36)` where the prefix is one random uuid
generated at construction.

- Saves 2 × (16 B crypto randomness + 36-char string formatting) per
  message. Small but free; also less string garbage.
- Risk: minimal (ids remain unique and string-typed; keep real uuids for
  request/response calls if there is any concern about cross-process id
  collision semantics).

### P5 — Microtask diet on `ConnectionManager.send`
**File**: `packages/dht/src/connection/ConnectionManager.ts`
The send path is `async` end-to-end; each `await` costs a microtask even
when the awaited value is synchronous (connected endpoint, no locking).
Restructure the **connected fast path** to run synchronously up to the
actual `connection.send(binary)` (which is itself sync — datachannel
buffering), falling back to the async path only when a connection has to
be made or awaited.

- This is the largest single microtask consumer after P2 on the sender
  side, but also the most invasive change. Recommend doing P1-P4 first,
  re-measuring, and only then deciding whether P5 is still warranted.

### P6 (future, measure-first) — data-plane batching
Coalescing multiple `StreamMessage`s per neighbor per tick into one RPC
envelope would divide *all* per-message costs by the batch factor, but
changes wire behavior and latency characteristics. Out of scope for this
round; listed for completeness.

## 4. Expected impact (measured guest workload, ~180 msg/s)

| Metric | Today | After P1-P4 (est.) |
|---|---|---|
| timer installs/s | ~214 | **< 10** (P1 removes ~116, P3 collapses the rest into one interval) |
| microtasks/s | ~3 600 | **~1 500-2 000** (P2 sender path ≈ −600; P1 race/finally chains ≈ −350; remainder is genuine handler work) |
| short-lived allocations | 4 Deferred + UnaryCall + 2 uuid strings + race wrappers per msg | ~1 object per msg |

Secondary effect: less promise/closure garbage → fewer minor GCs on the
busiest worker (the same recording showed the networknode worker spending
more time in GC than any other worker except the page).

## 5. Validation plan

1. Unit: existing proto-rpc + dht test suites (no wire change ⇒ no
   protocol-test churn expected); add a regression test asserting
   notification handlers run without a timeout timer (fake timers).
2. Load A/B in StreamrTV (the consumer that motivated this): the app's
   `[perf-counters]` infrastructure and Safari timeline (CPU + Script
   instruments only — the Allocations instrument forces 10 s synchronized
   GC/snapshot cycles and must stay off for representative numbers).
   Compare timer-installed/s and microtask/s on the networknode worker
   before/after at equal message rates.
3. Device check: 10-min iPhone guest session, CPU + temperature trend via
   the existing instrumentation.

## 6. Compatibility notes

- **No wire-format change in P1-P5** — all changes are local-process
  scheduling/allocation; nodes with and without the change interoperate.
- P1 changes *when* a notification handler's floating promise settles on
  pathological handler hangs (it no longer settles early). No caller
  observes this today.
- P3 changes client-request timeout granularity from exact to ±sweep
  interval. Default timeout is 5 000 ms.
- All changes live in `proto-rpc` and `dht`; `trackerless-network`
  requires no edits (it benefits transitively).
