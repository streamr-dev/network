import { StreamPartIDUtils } from "@streamr/utils"
import { ExperimentController } from "./ExperimentController"
import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"

const modes = [ 'propagation', 'join', 'routing' ]
const experiment = process.argv[2]
if (!modes.includes(experiment)) {
    throw new Error('only join mode is supported')
}
const run = async () => {
    const nodeCount = 10
    const controller = new ExperimentController(nodeCount) 
    controller.createServer()

    for (let i = 0; i < nodeCount; i++) {
        const node = new ExperimentNodeWrapper()
        node.connect() 
    }

    await controller.waitForClients()
    console.log('all clients connected')
    const entryPointId = await controller.startEntryPoint()
    console.log('entry point started', entryPointId)
    if (experiment === 'join') {
        await controller.startNodes(entryPointId, false)
        await controller.runJoinExperiment(entryPointId)
        console.log('experiment done')
        console.log(controller.getResults())
    } else if (experiment === 'propagation') { 
        await controller.startNodes(entryPointId)
        console.log('all nodes started')
        const streamPartId = StreamPartIDUtils.parse('experiment#0')
        await controller.joinStreamPart(streamPartId)
        console.log('all nodes joined stream part')
        await controller.publishMessage(streamPartId)
        console.log('all nodes published message')
        // IMPLEMENT RESULT COLLECTION HERE
    } else {
        await controller.startNodes(entryPointId)
        console.log('all nodes started')
    }

}

run()