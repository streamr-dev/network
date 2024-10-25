mkdir -p ./generated
npx protoc --ts_out ./experiment/generated --ts_opt server_generic,generate_dependencies,long_type_number --proto_path ../.. packages/trackerless-network/experiment/Experiment.proto
