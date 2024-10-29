mkdir -p ./generated
npx protoc --ts_out ./generated --ts_opt server_generic,generate_dependencies,long_type_number --proto_path ../.. packages/autocertifier-client/protos/AutoCertifier.proto
