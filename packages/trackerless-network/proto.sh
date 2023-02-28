mkdir -p ./src/proto
npx protoc --ts_out ./src/proto --ts_opt server_generic,generate_dependencies,long_type_number --proto_path ../.. packages/trackerless-network/protos/NetworkRpc.proto
