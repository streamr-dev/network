mkdir -p ./src/proto
npx protoc --ts_out ./src/proto --ts_opt server_generic,generate_dependencies --proto_path ../.. packages/trackerless-network/protos/NetworkRpc.proto --experimental_allow_proto3_optional
