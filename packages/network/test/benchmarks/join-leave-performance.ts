/* eslint-disable no-console */
import { OverlayTopology } from '../../src/logic/tracker/OverlayTopology'

const NODE_DEGREE = 4
const NUM_OF_NODES = 4000
const NUM_OF_ROUNDS = 200

// Built up topology of NUM_OF_NODES nodes
const topology = new OverlayTopology(NODE_DEGREE)
for (let j = 0; j < NUM_OF_NODES; ++j) {
    const nodeId = `node-${j}`
    topology.update(nodeId, [])
    topology.formInstructions(nodeId)
}

const nodeIdxPicks: string[] = new Array(NUM_OF_ROUNDS)
for (let i = 0; i < nodeIdxPicks.length; ++i) {
    const idx = Math.floor(Math.random() * NUM_OF_NODES)
    nodeIdxPicks[i] = `node-${idx}`
}

const startTime = Date.now()
nodeIdxPicks.forEach((nodeId) => {
    topology.leave(nodeId).forEach((neighborId) => {
        topology.formInstructions(neighborId, true)
    })
    topology.update(nodeId, [])
    topology.formInstructions(nodeId)
})
const diff = Date.now() - startTime
console.info(`took ${diff / NUM_OF_ROUNDS} ms per node`)
