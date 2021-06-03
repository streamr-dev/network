import { startTracker, Tracker } from 'streamr-network'

import { Wallet } from 'ethers'
import { Broker } from '../../src/broker'

import { startBroker } from '../utils'

const httpPort1 = 29341
const httpPort2 = 29342
const wsPort1 = 29351
const wsPort2 = 29352
const networkPort1 = 29361
const networkPort2 = 29362
const trackerPort = 29370

describe('Multi-identity brokers', () => {

    let broker1: Broker 
    let broker2: Broker
    let tracker: Tracker

    beforeEach(async () => {
        const identity = Wallet.createRandom()
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        broker1 = await startBroker({
            name: 'storageNode1',
            privateKey: identity.privateKey,
            networkPort: networkPort1,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            streamrAddress: identity.address,
            enableCassandra: true
        })
        broker2 = await startBroker({
            name: 'storageNode2',
            privateKey: identity.privateKey,
            networkPort: networkPort2,
            trackerPort,
            httpPort: httpPort2,
            wsPort: wsPort2,
            streamrAddress: identity.address,
            enableCassandra: true
        })
    })
   
    afterEach(async () => {
        await Promise.all([
            broker1.close(),
            broker2.close(),
            tracker.stop() 
        ])
    })

    it('should ensure 2 brokers with the same privateKey can coexist', async () => {
        console.log('?')
    })
})
