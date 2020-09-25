import Debug from 'debug'
import { wait } from 'streamr-test-utils'
import AbortController from 'node-abort-controller'

import PushQueue from '../../src/PushQueue'

console.log = Debug('Streamr::console')

describe('PushQueue', () => {
    it('supports pre-buffering, async push & return', async () => {
        const q = new PushQueue()
        expect(q.length).toBe(0)
        const items = [1, 2, 3, 4]
        q.push(items[0])
        expect(q.length).toBe(1)
        q.push(items[1])
        expect(q.length).toBe(2)

        setTimeout(() => {
            // buffer should have drained by now
            expect(q.length).toBe(0)
            q.push(items[2])
            q.push(items[3])
            setTimeout(() => {
                q.return(5) // both items above should get through
                q.push('nope') // this should not
            }, 20)
        }, 10)

        let i = 0
        for await (const msg of q) {
            expect(msg).toBe(items[i])
            i += 1
        }

        expect(i).toBe(4)
        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('supports passing initial values to constructor', async () => {
        const q = new PushQueue(['a', 'b'])
        expect(q.length).toBe(2)

        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
            if (!q.length) {
                break // this calls await q.return()
            }
        }

        expect(msgs).toEqual(['a', 'b'])

        // buffer should have drained at end
        expect(q.length).toBe(0)

        // these should have no effect
        q.push('c')
        await q.return()
    })

    it('consumes buffered items even after return', async () => {
        const q = new PushQueue(['a', 'b'])
        q.return()
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
        }
        expect(msgs).toEqual(['a', 'b'])
    })

    it('handles iterating again', async () => {
        const q = new PushQueue(['a', 'b'])
        q.return()
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
        }
        // can't iterate again after return
        for await (const msg of q) {
            throw new Error('should not get here ' + msg)
        }
        expect(msgs).toEqual(['a', 'b'])
    })

    it('supports passing multiple values to push', async () => {
        const q = new PushQueue()
        q.push('a', 'b')
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
            if (!q.length) {
                break // this calls await q.return()
            }
        }

        expect(msgs).toEqual(['a', 'b'])

        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('supports multiple simultaneous calls to next', async () => {
        const q = new PushQueue()
        q.push('a', 'b')
        const msgs = await Promise.all([
            q.next(),
            q.next(),
        ]).then((m) => m.map(({ value }) => value))
        await q.return()

        expect(msgs).toEqual(['a', 'b'])

        // buffer should have drained at end
        expect(q.length).toBe(0)
    })

    it('handles throw', async () => {
        const q = new PushQueue(['a', 'b'])
        expect(q.length).toBe(2)

        const msgs = []
        setTimeout(() => {
            q.throw(new Error('expected error'))
            q.push('c') // should no-op
        })

        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
            }
        }).rejects.toThrow('expected error')

        await wait(10) // wait for maybe push
        // push('c') shouldn't have worked
        expect(msgs).toEqual(['a', 'b'])
        expect(q.length).toBe(0)
    })

    it('handles throw early', async () => {
        const q = new PushQueue()
        q.throw(new Error('expected error'))
        q.push('c') // should no-op

        const msgs = []
        await expect(async () => {
            for await (const msg of q) {
                msgs.push(msg)
            }
        }).rejects.toThrow('expected error')

        await wait(10) // wait for maybe push
        // push('c') shouldn't have worked
        expect(q.length).toBe(0)

        expect(msgs).toEqual([])
    })

    describe('abort', () => {
        it('can be aborted', async () => {
            const ac = new AbortController()

            const q = new PushQueue(['a', 'b'], {
                signal: ac.signal,
            })

            setTimeout(() => {
                ac.abort()
                q.push('nope1') // should no-op
            })

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')

            expect(msgs).toEqual(['a', 'b'])
        })

        it('handles aborting multiple buffers', async () => {
            const ac = new AbortController()

            async function create(items = ['a', 'b']) {
                const q = new PushQueue(items, {
                    signal: ac.signal,
                })
                const msgs = []
                await expect(async () => {
                    for await (const msg of q) {
                        msgs.push(msg)
                    }
                }).rejects.toThrow('abort')
                await wait(10) // wait for maybe push
                expect(q.length).toBe(0)
                expect(msgs).toEqual(items)
            }

            setTimeout(() => {
                ac.abort()
            })

            await Promise.all([
                create(['a', 'b']),
                create(['c', 'd']),
                create([]),
            ])
        })

        it('can abort before iteration', async () => {
            const ac = new AbortController()

            const q = new PushQueue(['a', 'b'], {
                signal: ac.signal,
            })

            ac.abort()
            q.push('nope1') // should no-op
            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')
            expect(msgs).toEqual(['a', 'b']) // still gives buffered items
        })

        it('can abort before creating PushQueue', async () => {
            const ac = new AbortController()
            ac.abort()

            const q = new PushQueue(['a', 'b'], {
                signal: ac.signal,
            })
            q.push('nope1') // should no-op

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')
            expect(msgs).toEqual(['a', 'b']) // still gives buffered items
        })
    })
})
