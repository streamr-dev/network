mkdir -p ./src/generated
npx protoc --ts_out ./src/generated --ts_opt server_generic,generate_dependencies,long_type_number --proto_path ../.. packages/sdk/protos/SdkRpc.proto
