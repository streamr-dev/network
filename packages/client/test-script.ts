import { StreamrClient } from './src/StreamrClient'

const main = async () => {
    const name = 'santeri'
    const client = new StreamrClient({
        auth: {
            privateKey: ''
        },
        network: {
            layer0: {
                entryPoints: [{
                    kademliaId: 'entrypoint',
                    websocket: {
                            ip: '95.216.64.56',
                            port: 30000
                    },
                    type: 0
                }],
                stringKademliaId: name,
                iceServers: [
                    {
                        url: 'stun:stun.streamr.network',
                        port: 5349
                    },
                    {
                        url: 'turn:turn.streamr.network',
                        port: 5349,
                        username: 'BrubeckTurn1',
                        password: 'MIlbgtMw4nhpmbgqRrht1Q=='
                    },
                    {
                        url: 'turn:turn.streamr.network',
                        port: 5349,
                        username: 'BrubeckTurn1',
                        password: 'MIlbgtMw4nhpmbgqRrht1Q==',
                        tcp: true
                    }
                ],
                webrtcDisallowPrivateAddresses: false
            }
        }
    })
    const sub = await client.subscribe('0x9b3e47c99f06f49724f8527ed493d253d83becfc/foo/bar', (content, message) => {
        console.log(content, message.streamMessage.groupKeyId)
    })
    sub.on('error', (err) => {
        console.error(err)
    })
    setInterval(async () => {
        console.info("publishing....")
        await client.publish('0x9b3e47c99f06f49724f8527ed493d253d83becfc/foo/bar', {
            name,
            "jotakin": Math.random() * 10000 
        })
    }, 2000)
}

main()
