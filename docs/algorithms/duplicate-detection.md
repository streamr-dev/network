# Duplicate detection

This document motivates and outlines how the duplicate detection and avoidance mechanism works in the network nodes.

## Motivation
To avoid wasting network bandwidth and to allow the network to scale, network nodes should avoid re-propagating messages
they have already propagated. Furthermore, it is desirable for the detection and avoidance of duplicates to not be
too taxing on local resources (e.g. CPU & RAM) of a node.

Using the fact that messages have identity and ordering, we can achieve both goals. In what follows, we explain how the
duplicate detection and avoidance mechanism works. We start off with simplified versions of the problem and then
gradually progress towards the actual solution employed. This is done for clarity, as the main idea is not too
complicated. Indeed, much of the complexity arises from handling the minute details of message numbering.

## Solutions

### Naive solution
A naive solution would be to store every encountered message identity in a set, and then check it for duplicates. The
downside of this approach is that the memory use will grow without bounds as long as the the software runs. (In
practice, very old message identities could be pruned as they would most likely not be encountered after a while.)

### Simplified problem

[Message order](todo) in Streamr network is defined per message chain, which is a
`(streamId, streamPartition, publisherId, msgChainId)` tuple. Messages within this tuple have a clearly defined order.
However, messages between different streams, or messages within the same stream but produced by two different actors, do
not have a clear exact order.

In what follows, let's assume we are working within one message chain. Let us also assume, and this is the
simplification, that messages are numbered from the sequence of natural numbers: 1,2,3,4,5,6,...

When a network node receives messages with numbers 1,2,3,4,5,6,10,11,12,18,19,20 we could add them all to a set to
allow for duplicate detection. But instead let's use properties of the order and numbering to aid us find a more compact
solution. What we know:
- Any message with a number with 6 or below is a duplicate
- We have a gap of 3 missing numbers between 6 and 10: 7, 8, 9
- We have a gap of  5 missing numbers between 12 and 18: 13, 14, 15, 16, 17
- Any message with a number greater than 20 is a non-duplicate

Instead of storing what we have seen, let us do the opposite; that is, store what we _have not_ seen:
```
[7,9], [13,17], [21, \Inf]
```
The structure is an ordered list of (inclusive) intervals that we know contain unseen (non-duplicate) messages. The
first two entries correspond to the gaps we identified in the list above. The last entry corresponds to the next expected
message number(s).

Determining whether a message is a non-duplicate is as simple as going through the list and checking whether the message's
number belongs to one of the intervals. You can short-circuit the search early by utilizing the fact that the intervals
are sorted and mutually exclusive. For example, to check number 10, we go from right to left. First, we determine that
10 is not included in `[21, \Inf]`. Then we check that it is not in `[13,17]`. The next interval has a right-bound of
`9` that is less than 10. Thus we can stop the search here and determine that 10 is indeed a duplicate.

We only update the structure when we encounter a non-duplicate message. There are a total of four ways the structure can
be updated. They are exemplified below.
- _Left-side contraction_. Say we encounter number 7. We would then update first interval `[7,9] => [8,9]`. Similarly, if
  we encounter 21 we update last interval `[21, \Inf] => [22, \Inf]`.
- _Right-side contraction_. Say we encounter number 17, we update second interval `[13,17] => [13,16]`. Or say we
  encounter 9, in a similar fashion, we update first interval `[7,9] => [7,8]`. Notice that this rule never applies to the
  last interval containing infinity.
- _Division_. Occurs when the number is strictly between the bounds and results in the single interval being replaced
  with two, i.e. split. E.g. if we encounter number 15, we update second interval `[13,17] => [13,14], [16,17]`, making
  the entire structure look as follows `[7,9], [13,14], [16,17], [21, \Inf]`. In a similar fashion, if we encounter say 40, we divide
  the last interval `[21, \Inf] => [21,39], [41, \Inf]`.
- _Full contraction_. When an interval consists of only a single number, and that number is encountered, the interval
  is deleted. Say we encounter number 8 and then 7, the resulting structure would be `[9,9], [13,17], [21, \Inf]`. If we
  encounter number 9, the first interval is deleted and resulting structure `[13,17], [21, \Inf]` has one less interval.
  Notice that this rule never applies to the last interval.

### More realistic numbering
In practice, the numbering isn't based on the sequence of natural numbers but any strictly increasing integer sequence
instead. Usually timestamps. This means that given an interval `[a,b]` of unseen message numbers, we can't say for certain
how many messages it will contain. It could be up to `b - a + 1` messages, or at the very least, a single message. The
problem becomes: when can we safely close (fully contract) an interval if we don't know how many messages it is
supposed to have?

Fortunately, messages in the Streamr network contain a reference to their previous message number. This allows us to
spot if we are missing any messages in the associated message chain, i.e., gaps have formed. We refer to this as [gap
detection](todolink).

With intricate book-keeping of message numbers and previous message numbers of arriving messages, we can fully contract
an interval once we know the [gap has been filled](gapfiling). We still won't be able to say beforehand how many
messages a interval will contain, but we will know once all relevant messages have been received, and can thus close
the interval.

// TODO: Add example

### Actual solution
In Streamr network, we generally number messages based on milliseconds since Unix Epoch. What can sometimes happen is
that two messages get published by the same actor at the same exact millisecond. In this scenario, a tie-breaker is necessary to
retain message identity and order. Thus a second number is needed, which we call `sequenceNo`, and message numbers
essentially becomes pairs `(timestamp, sequenceNo)`.

While this does complicate the implementation even further and brings in some conceptual overhead, nothing fundamental
changes about our solution. The number pairs work as drop-in replacements for single numbers because they have a clearly
defined ordering, an equality operator, and a representation for infinity `(\Inf, \Inf)`.

// TODO: Add example? Maybe too intricate.






### Caveat: previous message number is omitted
It is permissible to publish messages into Streamr network without references to previous messages. This
severely impacts the effectiveness of duplicate detection and avoidance. In such scenarios, a best-effort service is
provided. We only compare received message numbers against the latest known message number of the chain. If the received
message has a lower or equal number, we deem it a duplicate and drop it. Otherwise we propagate it and mark it as the
latest known message.

## Comparison with OrderingUtil
The [OrderingUtil](https://github.com/streamr-dev/streamr-client-protocol-js/blob/master/src/utils/OrderingUtil.js)
used by streamr-client SDKs and broker adapters has parallels to the duplicate detection and avoidance mechanisms
presented here. They both revolve around message numbering, gap detection, and gap filling. That being said, they cater
to different needs.

The OrderingUtil will block processing of new messages when it encounters a gap. While it is blocked, it will
enqueue all received messages until the (most recent) gap has been filled, after which it will start processing &
clearing the queue. It will also take active measures in [gap filling](#gapfilling) by requesting resends from network
nodes.

In contrast, the duplicate detection and avoidance mechanism presented here will churn along even in the presence of
gaps. It will keep track of the gaps and potentially close them later, but it takes no active steps to accomplish
this.

The OrderingUtil is the ideal solution when processing _needs_ to happen in order and without gaps. Not a single message
should be lost and messages need to be analyzed in the exact order they were produced in. In many end-user applications,
this level of correctness is of utmost importance.

Network nodes, on the other hand, are focused on the propagation of messages, not their contents. Messages need to be
delivered to their recipients with as low a latency as possible. Hence blocking and waiting for the correct order to emerge
is not important. Moreover, network nodes have their own local states, which may be inconsistent with each other. While node A may have a gap or multiple
gaps, node B may have none having received all prior messages, and is just waiting for node A to propagate the next
message.
