import 'reflect-metadata'
import sinon from 'sinon'
import { container, DependencyContainer } from 'tsyringe'

import { StreamrClient } from '../../src/StreamrClient'
import { Defer } from '../../src/utils'
import Session from '../../src/Session'
import clientOptions from '../../src/ConfigTest'
import { Todo } from '../../src/types'
import { LoginEndpoints } from '../../src/LoginEndpoints'

describe('Session', () => {
    let session: Session
    let msg: Todo
    let clientSessionToken: Todo
    let loginFunction: Todo
    let logoutFunction: Todo

    const createClient = (opts: any = {}, parentContainer?: DependencyContainer) => new StreamrClient({
        ...clientOptions,
        autoConnect: false,
        autoDisconnect: false,
        ...opts,
    }, parentContainer)

    function setup(opts?: any) {
        const childContainer = container.createChildContainer()
        logoutFunction = sinon.stub().resolves()
        loginFunction = sinon.stub().resolves()
        loginFunction.onCall(0).resolves({
            token: 'session-token1',
        })
        loginFunction.onCall(1).resolves({
            token: 'session-token2',
        })
        childContainer.register<LoginEndpoints>(LoginEndpoints, {
            useValue: {
                loginWithChallengeResponse: loginFunction as LoginEndpoints['loginWithChallengeResponse'],
                logoutEndpoint: logoutFunction,
            } as LoginEndpoints
        })

        clientSessionToken = createClient(opts, childContainer)

        session = clientSessionToken.session
    }

    beforeEach(() => {
        setup()
    })

    afterAll(async () => {
        // give tests a few moments to end
        await new Promise((resolve) => setTimeout(resolve, 2000))
    })

    describe('instantiation', () => {
        it('should get token if set with a token', async () => {
            const clientNone = createClient({
                auth: {
                    sessionToken: 'test'
                },
            })
            const sessionToken = await clientNone.getSessionToken()
            expect(sessionToken).toBe(clientNone.options.auth.sessionToken)
        })

        it('should return empty string with no authentication', async () => {
            const clientNone = createClient({
                auth: {},
            })
            const sessionToken = await clientNone.session.getSessionToken()
            expect(sessionToken).toBe('')
        })

        it('login function should throw if only session token provided', async () => {
            const clientNone = createClient({
                auth: {
                    sessionToken: 'only-session-token',
                    privateKey: undefined,
                },
            })
            await expect(async () => (
                clientNone.session.sendLogin()
            )).rejects.toThrow(
                'Need either "privateKey", "ethereum" or "sessionToken" to login.'
            )
        })

        it('login should throw if no authentication', async () => {
            const clientNone = createClient({
                auth: {},
            })
            await clientNone.session.sendLogin().catch((err) => {
                expect(err.message).toEqual(
                    'Need either "privateKey", "ethereum" or "sessionToken" to login.'
                )
            })
        })
    })

    describe('getSessionToken', () => {
        it('should set sessionToken', async () => {
            await session.getSessionToken()
            expect(loginFunction.calledOnce).toBeTruthy()
            expect(session.options.sessionToken === 'session-token1').toBeTruthy()
        })

        it('should not call sendLogin if token set', async () => {
            session.options.sessionToken = 'session-token1'
            await session.getSessionToken()
            expect(loginFunction.notCalled).toBeTruthy()
        })

        it('should call sendLogin if new token required', async () => {
            session.options.sessionToken = 'expired-session-token'
            await session.getSessionToken(true)
            expect(loginFunction.calledOnce).toBeTruthy()
            expect(session.options.sessionToken === 'session-token1').toBeTruthy()
        })
    })

    describe('Internal state', () => {
        describe('sendLogin resolves', () => {
            it('should return same value when calling getSessionToken() twice while logging in', async () => {
                const p1 = session.getSessionToken()
                const p2 = session.getSessionToken()
                const [sessionToken1, sessionToken2] = await Promise.all([p1, p2])
                expect(loginFunction.calledOnce).toBeTruthy()
                expect(sessionToken1).toEqual(sessionToken2)
            })

            it('should return different values when retrieving fresh session tokens twice sequentially', async () => {
                const sessionToken1 = await session.getSessionToken(true)
                const sessionToken2 = await session.getSessionToken(true)
                expect(sessionToken1).not.toBe(sessionToken2)
            })
        })

        describe('sendLogin rejects', () => {
            beforeEach(() => {
                msg = 'Need either "privateKey", "ethereum" or "sessionToken" to login.'
                loginFunction.resetBehavior()
                loginFunction.rejects(new Error(msg))
            })

            it('should fail simultaneous requests with one call to sendLogin', async () => {
                await Promise.all([
                    expect(async () => (
                        session.getSessionToken()
                    )).rejects.toThrow(msg),
                    expect(async () => (
                        session.getSessionToken()
                    )).rejects.toThrow(msg)
                ])
                expect(loginFunction.calledOnce).toBeTruthy()
            })

            it('should fail both requests with two calls to sendLogin', async () => {
                await expect(async () => (
                    session.getSessionToken()
                )).rejects.toThrow(msg)
                await expect(async () => (
                    session.getSessionToken()
                )).rejects.toThrow(msg)
                expect(loginFunction.calledTwice).toBeTruthy()
            })
        })
    })

    describe('logout', () => {
        it('should call the logout endpoint', async () => {
            await session.getSessionToken()
            await session.logout()
            expect(logoutFunction.calledOnce).toBeTruthy()
        })

        it('should call the logout endpoint again', async () => {
            clientSessionToken.onError = () => {}
            await session.getSessionToken()
            await session.logout()
            await session.getSessionToken()
            await session.logout()
            expect(logoutFunction.calledTwice).toBeTruthy()
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
