import { spawn } from 'child_process'
import { program } from 'commander'
import * as path from 'path'

program
    .option('--numOfNodes <id>', 'Number of nodes in the network', '10')
    .option('--streamIds <streamIds>', 'streamId to publish',  (value: string) => value.split(','), ['stream-0'])
    .option('--entrypointIp <entrypointIp>', 'public IP of nodes to run', '0.0.0.0')
    .description('Run bootstrap node')
    .parse(process.argv)

async function run(): Promise<void> {

    const numOfNodes = parseInt(program.opts().numOfNodes, 10)

    const args = [
        path.resolve('./bin/bootstrap-node.ts'),
        '--ip=' + program.opts().ip
    ]

    spawn('ts-node', args, {
        stdio: [process.stdin, process.stdout, process.stderr]
    })

    setTimeout(async () => {
        for (let i = 0; i < numOfNodes; i++) {
            const args = [
                path.resolve('./bin/full-node-webrtc.ts'),
                '--id=full-node' + i,
                '--name=full-node' + i,
                '--wsPort=540' + i,
                '--entrypointIp=' + program.opts().entrypointIp
            ]

            spawn('ts-node', args, {
                stdio: [process.stdin, process.stdout, process.stderr]
            })
        }
    }, 2000)

}

run()
