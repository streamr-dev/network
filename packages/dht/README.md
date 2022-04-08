# @streamr/dht (WIP)

An implementation of the Kademlia-based Streamr DHT used for the trackerless network.

## Generating Protobuf code

```bash
npx protoc --ts_out . --proto_path protos protos/ClosestPeersRequest.proto
npx protoc --ts_out . --proto_path protos protos/ClosestPeersResponse.proto
 npx protoc --ts_out . --proto_path --ts_opt generate_dependencies protos protos/RouteMessage.proto
```