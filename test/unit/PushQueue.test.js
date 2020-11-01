import Debug from 'debug'
import { wait } from 'streamr-test-utils'
import AbortController from 'node-abort-controller'

import PushQueue from '../../src/utils/PushQueue'

const expected = [1, 2, 3, 4, 5, 6, 7, 8]
const WAIT = 20

console.log = Debug('Streamr::   CONSOLE   ')

async function* generate(items = expected) {
    await wait(WAIT * 0.1)
    for await (const item of items) {
        await wait(WAIT * 0.1)
        yield item
        await wait(WAIT * 0.1)
    }
    await wait(WAIT * 0.1)
}

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
        expect(q.length).toBe(0)
        await q.return()
        expect(q.length).toBe(0)
    })

    describe('from', () => {
        it('supports iterable', async () => {
            const q = PushQueue.from(expected)

            const msgs = []
            // will end when source ends
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            await q.return()
        })

        it('supports async iterable', async () => {
            const q = PushQueue.from(generate())

            const msgs = []
            // will end when source ends
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('can be aborted while waiting', async () => {
            const startedWaiting = jest.fn()
            const ac = new AbortController()
            let q
            const itr = (async function* Gen() {
                yield* expected
                yield await new Promise(() => {
                    setTimeout(() => {
                        ac.abort()
                        q.push('nope1') // should no-op
                    })
                    startedWaiting()
                }) // would wait forever
            }())

            q = PushQueue.from(itr, {
                signal: ac.signal,
            })

            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                }
            }).rejects.toThrow('abort')

            expect(msgs).toEqual(expected)
            expect(startedWaiting).toHaveBeenCalledTimes(1)
        })
    })

    describe('end', () => {
        it('can clean end after emptying buffer by pushing null', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === 1) {
                    q.push(null) // won't end immediately
                }
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('does not buffer items after null', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected, null, 'c')
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('does not buffer more items after end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            expected.forEach((v) => q.push(v))
            expect(q.length).toBe(expected.length)
            q.end()
            expect(q.length).toBe(expected.length)
            q.push('c') // should have no effect
            expect(q.length).toBe(expected.length)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('can clean end after emptying buffer with end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === 1) {
                    q.end() // won't end immediately
                }
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // these should have no effect
            q.push('c')
            expect(q.length).toBe(0)
        })

        it('can push final value then end after emptying buffer with end', async () => {
            const q = new PushQueue() // wouldn't end on its own
            q.push(...expected)

            const msgs = []
            for await (const msg of q) {
                msgs.push(msg)
                if (msgs.length === 1) {
                    q.end('c') // won't end immediately
                }
            }

            expect(msgs).toEqual([...expected, 'c'])

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })

        it('works with pending next', async () => {
            const q = new PushQueue()
            q.push(expected[0]) // preload first item
            const msgsTask = Promise.all([
                q.next(),
                q.next(),
            ]).then((m) => m.map(({ value }) => value))
            q.push(...expected.slice(1)) // push rest after calls to next
            q.end() // finish up

            const msgs = await msgsTask
            for await (const msg of q) {
                msgs.push(msg) // gets rest of messages
            }

            expect(msgs).toEqual(expected)

            // buffer should have drained at end
            expect(q.length).toBe(0)

            // buffer should have drained at end
            expect(q.length).toBe(0)
        })
    })

    it('does not consume buffered items after return', async () => {
        const q = new PushQueue(['a', 'b'])
        expect(q.length).toBe(2)
        await q.return()
        expect(q.length).toBe(0)
        for await (const msg of q) {
            throw new Error('should not get here ' + msg)
        }
    })

    it('handles break', async () => {
        const q = new PushQueue(['a', 'b'])
        expect(q.length).toBe(2)
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg) // gets rest of messages
            break
        }
        expect(msgs).toEqual(['a'])
    })

    it('handles iterating again', async () => {
        const q = new PushQueue(['a', 'b'])
        const msgs = []
        for await (const msg of q) {
            msgs.push(msg)
            if (q.length === 0) {
                break
            }
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
        q.push('a') // should no-op
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

            q.push('nope1') // should no-op
            const msgs = []
            await expect(async () => {
                for await (const msg of q) {
                    msgs.push(msg)
                    ac.abort()
                }
            }).rejects.toThrow('abort')
            expect(msgs).toEqual(['a']) // only gives buffered items before abort
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
            expect(msgs).toEqual([]) // still gives buffered items
        })
    })
})
