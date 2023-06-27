---
sidebar_position: 1
---

# What is pub/sub?

:::tip Key Point:
Understand what pub/sub is, and the advantages of Pub/Sub compared to a request/response pattern. Also, learn about core Pub/Sub concepts related to Streamr that include the terms stream (stream), publisher, and subscriber.
:::

## Pub/sub in a nutshell

**Pub/sub**, short for publish/subscribe, is a messaging pattern that allows for the asynchronous and scalable communication of participants in a distributed system.

With pub/sub, there is a data stream that Publishers and Subscribers can use to read and write data.

Subscribers receive and consume the data from the stream, while Publishers can send data to the stream. Unlike a traditional request/response pattern (e.g., a REST API), the Publishers send data without regard to how or when these events will be processed. Meaning they don't wait for the Subscribers to receive the data.

When a Publisher sends data to the stream, it gets delivered to all services that subscribe to them asynchronously. This increases the flexibility and robustness of the overall system.

:::info
Don't confuse this with an `async await` request. That's the point, a service just publishes data but does not `await` for the next service to consume the data. In fact, it does not care. Services that subscribe to the data then receive and consume the data without notifying the publisher.
:::

The pub/sub Streamr Network allows services to communicate asynchronously, with latencies on the order of under 350 milliseconds.

**Publishers** are services that send data to the message broker. These messages are typically sent to a specific stream, which is a channel for communication/data. The message broker then distributes the messages to subscribers who subscribe to that stream.

**Subscribers** are services that are interested in receiving messages from one or more streams. They can choose to subscribe to multiple issues, allowing them to receive a wide range of messages.

## Common use cases

Ingestion user interaction and server events. To use user interaction events from end-user apps or server events from your system, you might forward them to Pub/Sub. You can then use a stream processing tool, such as Dataflow, which delivers the events to databases. Examples of such databases are BigQuery, Cloud Bigtable, and Cloud Storage. Pub/Sub lets you gather events from many clients simultaneously.

Real-time event distribution. Events, raw or processed, may be made available to multiple applications across your team and organization for real- time processing. Pub/Sub supports an "enterprise event bus" and event-driven application design patterns. Pub/Sub lets you integrate with many Google systems that export events to Pub/Sub.

Replicating data among databases. Pub/Sub is commonly used to distribute change events from databases. These events can be used to construct a view of the database state and state history in BigQuery and other data storage systems.

Parallel processing and workflows. You can efficiently distribute many tasks among multiple workers by using Pub/Sub messages to connect to Cloud Functions. Examples of such tasks are compressing text files, sending email notifications, evaluating AI models, and reformatting images.

Enterprise event bus. You can create an enterprise-wide real-time data sharing bus, distributing business events, database updates, and analytics events across your organization.

Data streaming from applications, services, or IoT devices. For example, a SaaS application can publish a real-time feed of events. Or, a residential sensor can stream data to Pub/Sub for use in other Google Cloud products through a Dataflow pipeline.

Refreshing distributed caches. For example, an application can publish invalidation events to update the IDs of objects that have changed.

Load balancing for reliability. For example, instances of a service may be deployed on Compute Engine in multiple zones but subscribe to a common stream. When the service fails in any zone, the others can pick up the load automatically.

## Core concepts with Streamr

**Stream.** A named resource to which messages are sent by publishers.

**Subscription.** A named resource representing the stream of messages from a single, specific stream, to be delivered to the subscribing application. For more details about subscriptions and message delivery semantics, see the Subscriber Guide.
Message. The combination of data and (optional) attributes that a publisher sends to a stream and is eventually delivered to subscribers.

**Message attribute.** A key-value pair that a publisher can define for a message. For example, key iana.org/language_tag and value en could be added to messages to mark them as readable by an English-speaking subscriber.

**Publisher.** An application that creates and sends messages to a single or multiple streams.

**Subscriber.** An application with a subscription to a single or multiple streams to receive messages from it.
Acknowledgment (or "ack"). A signal sent by a subscriber to Pub/Sub after it has received a message successfully. Acknowledged messages are removed from the subscription message queue.

**Push and pull.** The two message delivery methods. A subscriber receives messages either by Pub/Sub pushing them to the subscriber chosen endpoint, or by the subscriber pulling them from the service.

**Publisher-subscriber relationships** can be one-to-many (fan-out), many-to-one (fan-in), and many-to-many
