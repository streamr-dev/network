import { iceServerAsString } from '../../src/connection/webrtc/iceServerAsString'

describe('iceServerAsString', () => {
    it('without password and username', () => {
        expect(iceServerAsString({
            url: 'stun:stun.streamr.network',
            port: 5349
        })).toEqual('stun:stun.streamr.network:5349')
    })

    it('with password and username', () => {
        expect(iceServerAsString({
            url: 'turn:turn.streamr.network',
            port: 5349,
            username: 'user',
            password: 'foobar'
        })).toEqual('turn:user:foobar@turn.streamr.network:5349')
    })

    it('with password, username and tcp', () => {
        expect(iceServerAsString({
            url: 'turn:turn.streamr.network',
            port: 5349,
            username: 'user',
            password: 'foobar',
            tcp: true
        })).toEqual('turn:user:foobar@turn.streamr.network:5349?transport=tcp')
    })

    it('throws if given url without protocol', () => {
        expect(() => {
            iceServerAsString({
                url: 'turn.streamr.network',
                port: 5349,
                username: 'user',
                password: 'foobar'
            })
        }).toThrowError('invalid stun/turn format: turn.streamr.network')
    })

    it('throws if given username without password', () => {
        expect(() => {
            iceServerAsString({
                url: 'turn:turn.streamr.network',
                port: 5349,
                username: 'user'
            })
        }).toThrowError('username (user) and password (undefined) must be supplied together')
    })

    it('throws if given password without username', () => {
        expect(() => {
            iceServerAsString({
                url: 'turn:turn.streamr.network',
                port: 5349,
                password: 'foobar'
            })
        }).toThrowError('username (undefined) and password (foobar) must be supplied together')
    })
})
