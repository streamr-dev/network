mkdir -p ./src/proto
npx protoc --ts_out ./src/proto --ts_opt server_generic,generate_dependencies --proto_path ../.. packages/dht/protos/DhtRpc.proto --experimental_allow_proto3_optional
