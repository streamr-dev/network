import sinon from 'sinon'

import StreamrClient from '../../src'
import config from '../integration/config'
import Session from '../../src/Session'

describe('Session', () => {
    let session
    let msg
    let clientSessionToken
    let clientNone

    const createClient = (opts = {}) => new StreamrClient({
        autoConnect: false,
        autoDisconnect: false,
        ...config.clientOptions,
        ...opts,
    })

    beforeEach(() => {
        clientSessionToken = createClient({
            auth: {
                sessionToken: 'session-token',
            },
        })
        clientSessionToken.logoutEndpoint = sinon.stub().resolves()
        clientNone = createClient({
            auth: {},
        })
    })

    beforeEach(() => {
        session = new Session(clientSessionToken)
        session.options.unauthenticated = false
        session.loginFunction = sinon.stub()
        session.loginFunction.onCall(0).resolves({
            token: 'session-token1',
        })
        session.loginFunction.onCall(1).resolves({
            token: 'session-token2',
        })
    })

    describe('instantiation', () => {
        it('should get token if set with a token', async () => {
            const sessionToken = await clientSessionToken.session.getSessionToken()
            expect(sessionToken).toBe(clientSessionToken.session.options.sessionToken)
        })

        it('should return undefined with no authentication', async () => {
            const sessionToken = await clientNone.session.getSessionToken()
            expect(sessionToken).toBe(undefined)
        })

        it('login function should throw if only session token provided', (done) => (
            clientSessionToken.session.loginFunction()
                .catch((err) => {
                    expect(err.toString()).toEqual(
                        'Error: Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to login.'
                    )
                    done()
                })
        ))

        it('login function should throw if no authentication', (done) => (
            clientNone.session.loginFunction()
                .catch((err) => {
                    expect(err.toString()).toEqual(
                        'Error: Need either "privateKey", "provider", "apiKey", "username"+"password" or "sessionToken" to login.'
                    )
                    done()
                })
        ))
    })

    describe('getSessionToken', () => {
        it('should set sessionToken', async () => {
            await session.getSessionToken()
            expect(session.loginFunction.calledOnce).toBeTruthy()
            expect(session.options.sessionToken === 'session-token1').toBeTruthy()
        })

        it('should not call loginFunction if token set', async () => {
            session.options.sessionToken = 'session-token1'
            await session.getSessionToken()
            expect(session.loginFunction.notCalled).toBeTruthy()
        })

        it('should call loginFunction if new token required', async () => {
            session.options.sessionToken = 'expired-session-token'
            await session.getSessionToken(true)
            expect(session.loginFunction.calledOnce).toBeTruthy()
            expect(session.options.sessionToken === 'session-token1').toBeTruthy()
        })
    })

    describe('Internal state', () => {
        describe('loginFunction resolves', () => {
            it('should return same value when calling getSessionToken() twice while logging in', async () => {
                const p1 = session.getSessionToken()
                const p2 = session.getSessionToken()
                const [sessionToken1, sessionToken2] = await Promise.all([p1, p2])
                expect(session.loginFunction.calledOnce).toBeTruthy()
                expect(sessionToken1).toEqual(sessionToken2)
            })
            it('should return different values when retrieving fresh session tokens twice sequentially', async () => {
                const sessionToken1 = await session.getSessionToken(true)
                const sessionToken2 = await session.getSessionToken(true)
                expect(sessionToken1).not.toBe(sessionToken2)
            })
        })

        describe('loginFunction rejects', () => {
            beforeEach(() => {
                session = new Session()
                session.options.unauthenticated = false
                msg = 'Error: Need either "privateKey", "provider", "apiKey" or "username"+"password" to login.'
                session.loginFunction = sinon.stub().rejects(msg)
            })

            it('should fail both requests with one call to loginFunction', (done) => {
                const p1 = session.getSessionToken()
                const p2 = session.getSessionToken()
                p1.catch((err) => {
                    expect(err.toString()).toEqual(msg)
                })
                p2.catch((err) => {
                    expect(err.toString()).toEqual(msg)
                    expect(session.loginFunction.calledOnce).toBeTruthy()
                    done()
                })
            })

            it('should fail both requests with two calls to loginFunction', (done) => {
                const p1 = session.getSessionToken()
                p1.catch((err) => {
                    expect(err.toString()).toEqual(msg)
                    const p2 = session.getSessionToken()
                    p2.catch((err2) => {
                        expect(err2.toString()).toEqual(msg)
                        expect(session.loginFunction.calledTwice).toBeTruthy()
                        done()
                    })
                })
            })
        })
    })

    describe('logout', () => {
        it('should call the logout endpoint', async () => {
            await session.getSessionToken()
            await session.logout()
            expect(clientSessionToken.logoutEndpoint.calledOnce).toBeTruthy()
        })

        it('should call the logout endpoint again', async () => {
            await session.getSessionToken()
            await session.logout()
            await session.getSessionToken()
            await session.logout()
            expect(clientSessionToken.logoutEndpoint.calledTwice).toBeTruthy()
        })

        it('should throw if already logging out', async (done) => {
            await session.getSessionToken()
            session.logout()
            session.logout().catch((err) => {
                expect(err.toString()).toBe('Error: Already logging out!')
                done()
            })
        })

        it('should throw if already logged out', async (done) => {
            await session.getSessionToken()
            await session.logout()
            session.logout().catch((err) => {
                expect(err.toString()).toBe('Error: Already logged out!')
                done()
            })
        })

        it('can logout while logging in', (done) => {
            session.once('logging in', async () => {
                await session.logout()
                done()
            })
            session.getSessionToken()
        })

        it('can login while logging out', async (done) => {
            session.once('logging out', async () => {
                await session.getSessionToken()
                done()
            })
            await session.getSessionToken()
            session.logout()
        })
    })
})
