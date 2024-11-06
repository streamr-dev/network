import { Logger, StreamPartIDUtils, wait } from "@streamr/utils"
import { ExperimentController } from "./ExperimentController"
import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"
import { AutoScalingClient, AutoScalingClientConfig, DescribePoliciesCommand, DescribePoliciesCommandInput, SetDesiredCapacityCommand, SetDesiredCapacityCommandInput } from "@aws-sdk/client-auto-scaling"
import 'dotenv/config'

const envs = [ 'local', 'aws' ]
const modes = [ 'propagation', 'join', 'routing', 'timetodata', 'scalingjoin' ]
const experiment = process.argv[2]
const env = process.argv[3]
const nodeCount = parseInt(process.argv[4])

if (!modes.includes(experiment)) {
    throw new Error('unknown experiment ' + experiment)
}

if (!envs.includes(env)) {
    throw new Error('unknown env ' + env)
}

const logger = new Logger(module)

const startLocalNodes = (nodeCount: number) => {
    for (let i = 0; i < nodeCount; i++) {
        const node = new ExperimentNodeWrapper('ws://localhost:7070', '127.0.0.1')
        node.connect() 
    }
}

const startAwsNodes = async (nodeCount: number) => {
    console.log(process.env.AWS_ACCESS_KEY!)
    console.log(process.env.AWS_SECRET_KEY!)
    const config: AutoScalingClientConfig = {
        region: "eu-north-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY!,
            secretAccessKey: process.env.AWS_SECRET_KEY!,
        }
    } 
    const client = new AutoScalingClient(config)
    const params: SetDesiredCapacityCommandInput = {
        AutoScalingGroupName: "network-experiment",
        DesiredCapacity: 1   
    }
    const command = new SetDesiredCapacityCommand(params)
    try {
        const res = await client.send(command)
        console.log(res)
    } catch (err) {
        console.error(err)
    }
}

const run = async () => {
    const controller = new ExperimentController(nodeCount) 
    controller.createServer()

    if (env === 'local') {
        startLocalNodes(nodeCount)
    } else if (env === 'aws') {
        await startAwsNodes(nodeCount)
        console.log('aws nodes started')
    }

    await controller.waitForClients()
    logger.info('all clients connected')
    if (experiment === 'join') {
        const entryPointId = await controller.startEntryPoint()
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId, false)
        await controller.runJoinExperiment(entryPointId)
        logger.info('experiment done')
    } else if (experiment === 'propagation') { 
        const entryPointId = await controller.startEntryPoint()
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId)
        logger.info('all nodes started')
        await controller.runPropagationExperiment(entryPointId)
    } else if (experiment === 'routing') {
        const entryPointId = await controller.startEntryPoint(true)
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId, true, true)
        logger.info('all nodes started')
        await wait(10000)
        await controller.runRoutingExperiment()
        logger.info('experiment done')
    } else if (experiment === 'timetodata') {
        const entryPointId = await controller.startEntryPoint()
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId, false)
        logger.info('all nodes started')
        await controller.runTimeToDataExperiment(entryPointId)
        logger.info('experiment done')
    } else if (experiment === 'scalingjoin') {
        const entryPointId = await controller.startEntryPoint()
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId, false)
        logger.info('all nodes started')
        await controller.runScalingJoinExperiment(entryPointId)
    } else {
        const entryPointId = await controller.startEntryPoint(true)
        logger.info('entry point started', { entryPointId })
        await controller.startNodes(entryPointId)
        logger.info('all nodes started')
    }
    logger.info(`experiment ${experiment} completed`)
}

run()
