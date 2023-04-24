---
sidebar_position: 3
---

# Network nodes

Applications publish and subscribe to [streams](../usage/streams/creating-streams) via Streamr nodes. In other words, nodes are the access points to the Streamr Network. To connect your application to streams, you interface it with a Streamr node.

There are two strategies for interfacing applications with Streamr nodes:

- **Light nodes**: the node (the Streamr JS client) is imported to your application as a library and runs locally as part of your application
- **Broker nodes**: the node runs separately, and your application connects to it remotely using one of the supported protocols

Which approach to choose depends on your use case. Here are some commonly used decision criteria:

- If you are developing in JS, use light nodes. For other programming languages, use Broker nodes.
- If your application runs on very limited CPU, memory, or bandwidth (such as battery-powered or embedded devices), use Broker nodes.
- If you want the data to be cryptographically signed at the source, use light nodes.

## Light nodes

Light nodes are Streamr nodes that run locally as part of your application instance. You use it exactly like any other library: you import it to your application and interface with it using function calls.

This is the most decentralized approach as it doesn't require you to host Streamr nodes separately, but on the other hand it requires a Streamr node implementation to exist for the programming language you're using. So far, the Streamr node has only been implemented in JS, meaning that light nodes can be used in web applications as well as Node.js-based applications.

## Broker nodes

Broker nodes are Streamr nodes that run externally to your application. You start up a node on a server, and interface with it remotely using one of the supported protocols.

The Broker node ships with plugins for HTTP, Websocket, and MQTT protocols. Libraries for these protocols exist in practically every programming language, meaning that you can conveniently publish and subscribe to data from the Streamr Network using any programming language.

Broker nodes have a plugin architecture that allows them to perform other tasks in addition to (or instead of) serving applications, such as mining.
