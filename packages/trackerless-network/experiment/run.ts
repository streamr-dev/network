import { StreamPartIDUtils, wait } from "@streamr/utils"
import { ExperimentController } from "./ExperimentController"
import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"

const modes = [ 'propagation', 'join', 'routing', 'timetodata', 'scalingjoin' ]
const experiment = process.argv[2]
if (!modes.includes(experiment)) {
    throw new Error('only join mode is supported')
}

const run = async () => {
    const nodeCount = 32
    const controller = new ExperimentController(nodeCount) 
    controller.createServer()

    for (let i = 0; i < nodeCount; i++) {
        const node = new ExperimentNodeWrapper()
        node.connect() 
    }

    await controller.waitForClients()
    console.log('all clients connected')
    if (experiment === 'join') {
        const entryPointId = await controller.startEntryPoint()
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId, false)
        await controller.runJoinExperiment(entryPointId)
        console.log('experiment done')
    } else if (experiment === 'propagation') { 
        const entryPointId = await controller.startEntryPoint()
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId)
        console.log('all nodes started')
        const streamPartId = StreamPartIDUtils.parse('experiment#0')
        await controller.joinStreamPart(streamPartId)
        console.log('all nodes joined stream part')
        await controller.publishMessage(streamPartId)
        console.log('all nodes published message')
        // IMPLEMENT RESULT COLLECTION HERE
        await controller.pullPropagationResults(streamPartId)        
    } else if (experiment === 'routing') {
        const entryPointId = await controller.startEntryPoint(true)
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId, true, true)
        console.log('all nodes started')
        await wait(10000)
        await controller.runRoutingExperiment()
        console.log('experiment done')
    } else if (experiment === 'timetodata') {
        const entryPointId = await controller.startEntryPoint()
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId, false)
        console.log('all nodes started')
        await controller.runTimeToDataExperiment(entryPointId)
        console.log('experiment done')
    } else if (experiment === 'scalingjoin') {
        const entryPointId = await controller.startEntryPoint()
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId, false)
        console.log('all nodes started')
        await controller.runScalingJoinExperiment(entryPointId)
        console.log('experiment done')
    } else {
        const entryPointId = await controller.startEntryPoint(true)
        console.log('entry point started', entryPointId)
        await controller.startNodes(entryPointId)
        console.log('all nodes started')
    }

}

run()