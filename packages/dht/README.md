# @streamr/dht (WIP)

An implementation of the Kademlia-based Streamr DHT used for the trackerless network.

## Generating Protobuf code

```bash
npx protoc --ts_out ./src/protocol/ --proto_path protos protos/ClosestPeers.proto
 npx protoc --ts_out ./src/protocol/ --proto_path --ts_opt generate_dependencies protos protos/RouteMessage.proto
```