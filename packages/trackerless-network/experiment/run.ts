import { Logger, wait } from "@streamr/utils"
import { ExperimentController } from "./ExperimentController"
import { ExperimentNodeWrapper } from "./ExperimentNodeWrapper"
import { AutoScalingClient, AutoScalingClientConfig, SetDesiredCapacityCommand, SetDesiredCapacityCommandInput } from "@aws-sdk/client-auto-scaling"
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2"
import 'dotenv/config'
import { joinResults, propagationResults, routingResults, timeToDataResults } from "./ResultCalculator"

const envs = [ 'local', 'aws' ]
const modes = [ 'propagation', 'join', 'routing', 'timetodata', 'scalingjoin', 'pinging', 'reset' ]
const experiment = process.argv[2]
const env = process.argv[3]
const numOfRepeats = parseInt(process.argv[4])
const ratioOfWsNodes = parseFloat(process.argv[5]) 

const nodeCounts = [
    // 1,
    // 2,
    // 4,
    // 8,
    16,
    // 32,
    // 64,
    // 128
]

const REGIONS = [
    'eu-north-1',
    'eu-central-1',
    // 'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-northeast-3',
    'ap-southeast-1',
    'ap-southeast-2',
    // 'ap-south-1',
    'sa-east-1',
    'ca-central-1',
    'af-south-1',
    'me-south-1',
    // 'me-central-1'
]
const AUTO_SCALING_GROUP_NAME = 'network-experiment-tf-test'

if (!modes.includes(experiment)) {
    throw new Error('unknown experiment ' + experiment)
}

if (!envs.includes(env)) {
    throw new Error('unknown env ' + env)
}

const logger = new Logger(module)

const startLocalNodes = (nodeCount: number) => {
    const nodes: ExperimentNodeWrapper[] = []
    for (let i = 0; i < nodeCount; i++) {
        const node = new ExperimentNodeWrapper('ws://localhost:7070', '127.0.0.1')
        node.connect() 
        nodes.push(node)
    }
    return nodes
}

const startAwsNodes = async (region: string, nodeCount: number) => {
    const config: AutoScalingClientConfig = {
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY!,
            secretAccessKey: process.env.AWS_SECRET_KEY!,
        }
    } 
    const client = new AutoScalingClient(config)
    const params: SetDesiredCapacityCommandInput = {
        AutoScalingGroupName: AUTO_SCALING_GROUP_NAME,
        DesiredCapacity: nodeCount   
    }
    const command = new SetDesiredCapacityCommand(params)
    try {
        const res = await client.send(command)
        console.log(res)
    } catch (err) {
        console.error(err)
    }
}

async function waitForInstances(region: string, nodeCount: number): Promise<Map<string, { domain: string, region: string }>> {
    const config = {
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY!,
            secretAccessKey: process.env.AWS_SECRET_KEY!,
        }
    } 
    const client = new EC2Client(config)
    const params = {
        Filters: [
            {
                Name: 'instance-state-name',
                Values: ['running'],
            }, 
            {
                Name: 'tag:Name',
                Values: ['network-experiment-tf-test']
            }
        ]
    }
    const seen = new Map<string, { domain: string, region: string }>()
    while (true) {
        try {
            const res = await client.send(new DescribeInstancesCommand(params))
            const instanceCount = res.Reservations!.flatMap((a) => a.Instances!.length).reduce((a, c) => a + c, 0)
            if (instanceCount === nodeCount) {
                res.Reservations!.flatMap((reservation) => reservation.Instances!.forEach((instance) => {
                    const ip = instance.PublicIpAddress!
                    const domain = instance.PublicDnsName!
                    seen.set(ip, { domain, region })
                    logger.info('Instance running, PublicDnsName: ' + domain + " InstanceId: " + instance.InstanceId)
                }))
                break
            } else {
                logger.info('waiting for instances to start in region ' + region + ' current count ' + instanceCount)
            }
        } catch (err) {
            console.error(err)
        } 
        await wait(10000)
    }
    return seen
}

const calculateResults = async (filePath: string): Promise<void> => {
    if (experiment === 'join' || experiment === 'scalingjoin') {
        await joinResults(filePath)
    } else if (experiment === 'routing') {
        await routingResults(filePath)
    } else if (experiment === 'timetodata') {
        await timeToDataResults(filePath)
    } else if (experiment === 'propagation') {
        await propagationResults(filePath)
    }
}

const stopAwsNodes = async (region: string) => {
    const config: AutoScalingClientConfig = {
        region,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY!,
            secretAccessKey: process.env.AWS_SECRET_KEY!,
        }
    } 
    const client = new AutoScalingClient(config)
    const params: SetDesiredCapacityCommandInput = {
        AutoScalingGroupName: AUTO_SCALING_GROUP_NAME,
        DesiredCapacity: 0   
    }
    const command = new SetDesiredCapacityCommand(params)
    try {
        const res = await client.send(command)
        console.log(res)
    } catch (err) {
        console.error(err)
    }
}

const startAwsInstances = async (controller: ExperimentController, nodeCountPerRegion: number) => {
    const instances = new Map<string, { domain: string, region: string }>()
    await Promise.all(REGIONS.map(async (region) => {
        await startAwsNodes(region, nodeCountPerRegion)
        const seenInRegion = await waitForInstances(region, nodeCountPerRegion)
        seenInRegion.forEach((value, key) => instances.set(key, value))
    }))
    logger.info('all aws instances started')
    let lastCount: number 
    const waitLogger = () => {
        const startedIps = controller.getIps()
        if (lastCount !== startedIps.size) {
            const startingInstances = Array.from(instances.entries()).filter(([ip, _]) => !startedIps.has(ip))
            logger.info('waiting for instances to connect', { startingInstances })
        }
        lastCount = startedIps.size
                   
    }
    await controller.waitForClients(() => waitLogger())
}

const run = async (ratioOfWsNodes: number, nodeCountPerRegion: number, resultName: string, runs: number) => {
    const nodeCount = env === 'aws' ? nodeCountPerRegion * REGIONS.length : nodeCountPerRegion
    for (let repeat = 0; repeat < runs; repeat++) {
        logger.info('starting experiment', { experiment, nodeCount, repeat })
        const resultFilePath = `results/${experiment}/${resultName}/node-count-${nodeCount}/${repeat}.json`
        const topologyFilePath = `topology/${experiment}/${resultName}/node-count-${nodeCount}/${repeat}.json`
        const controller = new ExperimentController(nodeCount, resultFilePath, topologyFilePath) 
        controller.createServer()
        let localNodes: ExperimentNodeWrapper[] = []
        if (env === 'local') {
            localNodes = startLocalNodes(nodeCount)
            await controller.waitForClients()
        } else if (env === 'aws') {
            if (repeat === 0) {
                await startAwsInstances(controller, nodeCountPerRegion)
            } else {
                await controller.waitForClients()
            }
        }
        logger.info('all clients connected')
        if (experiment === 'join') {
            const entryPointId = await controller.startEntryPoint()
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId, false)
            logger.info('all nodes started')
            await controller.runJoinExperiment(entryPointId)
            logger.info('experiment done')
        } else if (experiment === 'propagation') { 
            const entryPointId = await controller.startEntryPoint(false, true)
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId, true, false, true, true)
            logger.info('all nodes started')
            await controller.runPropagationExperiment('experiment#0')
        } else if (experiment === 'routing') {
            const entryPointId = await controller.startEntryPoint(true)
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId, true, true)
            logger.info('all nodes started')
            await wait(10000)
            await controller.runRoutingExperiment()
            logger.info('experiment done')
        } else if (experiment === 'timetodata') {
            const entryPointId = await controller.startEntryPoint()
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId, false)
            logger.info('all nodes started')
            await controller.runTimeToDataExperiment(Math.random() < ratioOfWsNodes, entryPointId)
            logger.info('experiment done')
        } else if (experiment === 'scalingjoin') {
            const entryPointId = await controller.startEntryPoint()
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId, false)
            logger.info('all nodes started')
            await controller.runScalingJoinExperiment(entryPointId)
        } else if (experiment === 'pinging') {
            logger.info('Starting pinging experiment')
            await controller.runPingingExperiment()
        } else {
            const entryPointId = await controller.startEntryPoint(true)
            logger.info('entry point started', { entryPointId })
            await controller.startNodes(ratioOfWsNodes, entryPointId)
            logger.info('all nodes started')
        }
        logger.info(`experiment ${experiment} completed`)
        if (env === 'aws') {
            if (repeat === runs - 1) {
                await Promise.all(REGIONS.map(async (region) => { 
                    await stopAwsNodes(region)
                    await waitForInstances(region, 0)
                }))
            } else {
                controller.stopNodes()
            }

        } else if (env === 'local') {
            await Promise.all(localNodes.map((node) => node.stop()))
        }
        logger.info('all nodes stopped', { nodeCount })
        await controller.stop()

        await calculateResults(resultFilePath)
    }
    
}

(async () => {
    if (experiment === 'reset') {
        await run(ratioOfWsNodes, 0, 'reset', 1)
    } else {
        const datetime = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
        for (const nodeCount of nodeCounts) {
            await run(ratioOfWsNodes, nodeCount, datetime, numOfRepeats)
        }
    }
    
})();
