---
sidebar_position: 2
---

# Streamr nodes
Applications publish and subscribe to [streams](../usage/streams/creating-streams) via Streamr nodes. In other words, nodes are the access points to the Streamr Network. To connect your application to streams, you interface it with a Streamr node.

:::info
If you'd like instructions on running a Streamr node, checkout [this guide](../guides/how-to-run-streamr-node.md).
:::

There are two strategies for interfacing applications with Streamr nodes:

1. Use the **Streamr SDK**: the Streamr node is imported to your application as a library and runs locally as part of your application.
2. Run a **Streamr node**: separate to your application. Connect to it remotely using one of the supported protocols.

Which approach to choose depends on your use case. Here are some commonly used decision criteria:

- If you are developing in JS (including the browser), use the Streamr SDK. For other programming languages, connect to a Streamr node.
- If your application runs on very limited CPU, memory, or bandwidth (such as battery-powered or embedded devices), connect to a Streamr node.
- If you want the data to be cryptographically signed at the source, use the Streamr SDK.

Running a Streamr node inside your app is the most decentralized approach as it doesn't require you to host Streamr nodes separately, but on the other hand it requires a Streamr node implementation to exist for the programming language you're using. So far, that's just TypeScript though we intend to increase native support to many other languages and environments in the future.

## Plugin interface
The Streamr node ships with plugins for HTTP, Websocket, and MQTT protocols. Libraries for these protocols exist in practically every programming language, meaning that you can conveniently publish and subscribe to data from the Streamr Network using any programming language.

Streamr nodes have a plugin architecture that allows them to perform other tasks in addition to (or instead of) serving applications, such as joining [stream Sponsorships](../streamr-network/incentives/stream-sponsorships.md) to relay data and earn DATA tokens.
