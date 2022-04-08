mkdir ./src/proto
npx protoc --ts_out ./src/proto --proto_path protos protos/ClosestPeers.proto
npx protoc --ts_out ./src/proto --ts_opt generate_dependencies --proto_path protos protos/RouteMessage.proto
npx protoc --ts_out ./src/proto --proto_path protos protos/ConnectivityReport.proto
