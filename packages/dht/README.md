# @streamr/dht (WIP)

An implementation of the Kademlia-based Streamr DHT used for the trackerless network.

## Generating Protobuf code

```bash
npx protoc --ts_out ./src/protocol/ --proto_path protos protos/ClosestPeers.proto
 npx protoc --ts_out ./src/protocol/ --proto_path --ts_opt generate_dependencies protos protos/RouteMessage.proto
```

## Running DHT simulations

Generate test data 

```bash
npm run prepare-dht-simulation
```

Run simulation

```bash
npm run run-dht-simulation 
```

In order to change number of nodes, or other simulation settings, 

* Edit the chages to the file 'test/simulation/data/generatedhtids.ts'. 
* Then generate new test data by running 'npm run prepare-dht-simulation'
* Edit the same changes to file 'src/simulation/DhtSimulation.ts'
* Run the simulation with new settings using 'npm run run-dht-simulation ' 
