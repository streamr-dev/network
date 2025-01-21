mkdir -p ./generated
npx protoc --ts_out ./generated --ts_opt  server_generic,generate_dependencies --proto_path protos protos/ProtoRpc.proto --experimental_allow_proto3_optional
