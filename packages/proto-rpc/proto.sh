mkdir -p ./generated
npx protoc --ts_out ./generated --ts_opt  server_generic,generate_dependencies --proto_path protos protos/ProtoRpc.proto --experimental_allow_proto3_optional
mkdir -p ./test/proto
npx protoc --ts_out ./test/proto --ts_opt server_generic,generate_dependencies --proto_path test/protos test/protos/*.proto --experimental_allow_proto3_optional
