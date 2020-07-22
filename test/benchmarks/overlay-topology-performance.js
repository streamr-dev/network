const OverlayTopology = require('../../src/logic/OverlayTopology')

const numOfRounds = 10
const numOfNeighbors = 4
const numOfNodeConfigurations = [10, 100, 200, 500, 1000, 2000, 5000]

// Run topology experiment
const measurements = {}
numOfNodeConfigurations.forEach((k) => {
    measurements[k] = []
})

for (let i = 0; i < numOfRounds; ++i) {
    numOfNodeConfigurations.forEach((numOfNodes) => {
        const topology = new OverlayTopology(numOfNeighbors)
        const startTime = Date.now()
        for (let j = 0; j < numOfNodes; ++j) {
            const nodeId = `node-${j}`
            topology.update(nodeId, [])
            topology.formInstructions(nodeId)
        }
        measurements[numOfNodes].push(Date.now() - startTime)
    })
}

const report = Object.entries(measurements).map(([numOfNodes, values]) => {
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length
    const msPerJoinedNode = mean / numOfNodes
    return {
        numOfNodes,
        mean,
        msPerJoinedNode
    }
})

console.table(report)
