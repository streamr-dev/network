import { ethers } from 'ethers'
import { wait, waitForCondition } from 'streamr-test-utils'

import StreamrClient from '../../src'
import { uid } from '../utils'

import config from './config'

describe('multiple users', () => {
    let client1
    let client2
    let errors = []
    function onError(error) {
        errors.push(error)
    }
    beforeEach(async () => {
        errors = []
    })

    afterEach(async () => {
        if (client1) {
            client1.removeListener('error', onError)
            await client1.ensureDisconnected()
        }

        if (client2) {
            client2.removeListener('error', onError)
            await client2.ensureDisconnected()
        }

        expect(errors[0]).toBeFalsy()
        expect(errors).toHaveLength(0)
    })

    it('works with multiple identities', async () => {
        const wallet1 = ethers.Wallet.createRandom()
        const wallet2 = ethers.Wallet.createRandom()
        client1 = new StreamrClient({
            auth: {
                privateKey: wallet1.privateKey,
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })
        await client1.ensureConnected()
        const stream = await client1.createStream({
            name: uid('stream')
        })
        await stream.grantPermission('stream_get', wallet2.address)
        await stream.grantPermission('stream_subscribe', wallet2.address)
        // NOTE: currently have to connect second client after permissions granted or backend errors
        client2 = new StreamrClient({
            auth: {
                privateKey: wallet1.privateKey,
            },
            autoConnect: false,
            autoDisconnect: false,
            ...config.clientOptions,
        })

        await client2.ensureConnected()

        const receivedMessages = []
        const sub = client2.subscribe(stream.id, (msg) => {
            receivedMessages.push(msg)
        })
        await new Promise((resolve) => sub.once('subscribed', resolve))

        const msg = {
            msg: uid('msg'),
        }
        await client1.publish(stream.id, msg)
        await waitForCondition(() => receivedMessages.length === 1, 10000)
        expect(receivedMessages).toEqual([msg])
    })
})
