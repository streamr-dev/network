import sinon from 'sinon'

import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import Session from '../../src/Session'
import config from '../integration/config'
import { Todo } from '../../src/types'

describe('Session', () => {
    let session: Session
    let msg: Todo
    let clientSessionToken: Todo

    const createClient = (opts = {}) => new StreamrClient({
        ...clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    })

    beforeEach(() => {
        clientSessionToken = createClient({
            auth: {
                sessionToken: 'session-token',
            },
        })
        clientSessionToken.logoutEndpoint = sinon.stub().resolves()

        session = new Session(clientSessionToken)
        session.options.unauthenticated = false
        session.loginFunction = sinon.stub()
        // @ts-expect-error
        session.loginFunction.onCall(0).resolves({
            token: 'session-token1',
        })
        // @ts-expect-error
        session.loginFunction.onCall(1).resolves({
            token: 'session-token2',
        })
    })

    afterAll(async () => {
        // give tests a few moments to end
        await new Promise((resolve) => setTimeout(resolve, 2000))
    })

    describe('instantiation', () => {
        it('should get token if set with a token', async () => {
            const sessionToken = await clientSessionToken.session.getSessionToken()
            expect(sessionToken).toBe(clientSessionToken.session.options.sessionToken)
        })

        it('should return undefined with no authentication', async () => {
            const clientNone = createClient({
                auth: {},
            })
            clientNone.onError = () => {}
            const sessionToken = await clientNone.session.getSessionToken()
            expect(sessionToken).toBe(undefined)
        })

        it('login function should throw if only session token provided', async () => {
            clientSessionToken.onError = () => {}
            await expect(async () => (
                clientSessionToken.session.loginFunction()
            )).rejects.toThrow(
                'Need either "privateKey", "ethereum" or "sessionToken" to login.'
            )
        })

        it('login function should throw if no authentication', async () => {
            const clientNone = createClient({
                auth: {},
            })
            clientNone.onError = () => {}
            await clientNone.session.loginFunction().catch((err) => {
                expect(err.message).toEqual(
                    'Need either "privateKey", "ethereum" or "sessionToken" to login.'
                )
            })
            clientNone.onError = () => {}

            await expect(async () => (
                clientSessionToken.session.loginFunction()
            )).rejects.toThrow(
                'Need either "privateKey", "ethereum" or "sessionToken" to login.'
            )
        })
    })

    describe('getSessionToken', () => {
        it('should set sessionToken', async () => {
            await session.getSessionToken()
            // @ts-expect-error
            expect(session.loginFunction.calledOnce).toBeTruthy()
            expect(session.options.sessionToken === 'session-token1').toBeTruthy()
        })

        it('should not call loginFunction if token set', async () => {
            session.options.sessionToken = 'session-token1'
            await session.getSessionToken()
            // @ts-expect-error
            expect(session.loginFunction.notCalled).toBeTruthy()
        })

        it('should call loginFunction if new token required', async () => {
            session.options.sessionToken = 'expired-session-token'
            await session.getSessionToken(true)
            // @ts-expect-error
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
                // @ts-expect-error
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
                session = new Session(undefined as any)
                session.options.unauthenticated = false
                msg = 'Need either "privateKey", "ethereum" or "sessionToken" to login.'
                session.loginFunction = sinon.stub().rejects(new Error(msg))
                clientSessionToken.onError = () => {}
            })

            it('should fail simultaneous requests with one call to loginFunction', async () => {
                await Promise.all([
                    expect(async () => (
                        session.getSessionToken()
                    )).rejects.toThrow(msg),
                    expect(async () => (
                        session.getSessionToken()
                    )).rejects.toThrow(msg)
                ])
                // @ts-expect-error
                expect(session.loginFunction.calledOnce).toBeTruthy()
            })

            it('should fail both requests with two calls to loginFunction', async () => {
                await expect(async () => (
                    session.getSessionToken()
                )).rejects.toThrow(msg)
                await expect(async () => (
                    session.getSessionToken()
                )).rejects.toThrow(msg)
                // @ts-expect-error
                expect(session.loginFunction.calledTwice).toBeTruthy()
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
            clientSessionToken.onError = () => {}
            await session.getSessionToken()
            await session.logout()
            await session.getSessionToken()
            await session.logout()
            expect(clientSessionToken.logoutEndpoint.calledTwice).toBeTruthy()
        })

        it('should throw if already logging out', async () => {
            await session.getSessionToken()
            session.logout()
            clientSessionToken.onError = () => {}
            await expect(async () => (
                session.logout()
            )).rejects.toThrow('Already logging out!')
        })

        it('should throw if already logged out', async () => {
            await session.getSessionToken()
            clientSessionToken.onError = () => {}
            await session.logout()
            await expect(async () => (
                session.logout()
            )).rejects.toThrow('Already logged out!')
        })

        it('can logout while logging in', async () => {
            const done = Defer()
            session.once('logging in', done.wrap(async () => {
                await session.logout()
            }))
            await session.getSessionToken()
            await done
        })

        it('can login while logging out', async () => {
            const done = Defer()
            session.once('logging out', done.wrap(async () => {
                await session.getSessionToken()
            }))
            await session.getSessionToken()
            await session.logout()
        })
    })
})
