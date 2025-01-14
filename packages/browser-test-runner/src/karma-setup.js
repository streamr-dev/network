// Add important parts of Jest to the Karma/Jasmine browser-test runtime's global scope
// the jest.fn() API

import * as jestMock from 'jest-mock'

// The following lines need to use the require syntax to fix
// process.stdout dependency in expect v. 28+
process.stdout = {}
const expect = require('expect').default

import { ModernFakeTimers } from '@jest/fake-timers'

// importing jest-extended directly relies on global.expect to be set
// importing the matchers and calling expect.extend manually
// prevents tests failing due to global.expect not being set
import * as jestExtendedMatchers from 'jest-extended'

import { format } from 'util'

let jest = jestMock
const timers = new ModernFakeTimers({ global: window, config: {} })

// prevent navigation
// without this karma fails the suite with "Some of your tests did a full page reload!"
// not clear what is causing the reload.
window.onbeforeunload = () => 'unload prevented'

jest.advanceTimersByTime = timers.advanceTimersByTime.bind(timers)
jest.advanceTimersToNextTimer = timers.advanceTimersToNextTimer.bind(timers)
jest.clearAllTimers = timers.clearAllTimers.bind(timers)
jest.dispose = timers.dispose.bind(timers)
jest.getRealSystemTime = timers.getRealSystemTime.bind(timers)
jest.getTimerCount = timers.getTimerCount.bind(timers)
jest.reset = timers.reset.bind(timers)
jest.runAllTicks = timers.runAllTicks.bind(timers)
jest.runAllTimers = timers.runAllTimers.bind(timers)
jest.runOnlyPendingTimers = timers.runOnlyPendingTimers.bind(timers)
jest.setSystemTime = timers.setSystemTime.bind(timers)
jest.useFakeTimers = timers.useFakeTimers.bind(timers)
jest.useRealTimers = timers.useRealTimers.bind(timers)

// eslint-disable-next-line no-undef
jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000

// eslint-disable-next-line no-underscore-dangle
jest._checkFakeTimers = timers._checkFakeTimers.bind(timers)

// eslint-disable-next-line no-undef
jasmine.getEnv().configure({ random: false }) // disable random test order

Object.assign(jest, timers)

expect.extend(jestExtendedMatchers)

// Add missing Jest functions
window.test = window.it
window.test.each = (inputs) => (testName, test) =>
    inputs.forEach((args) => window.it(format(testName, args), () => test(args)))
window.describe.each = (inputs) => (testName, test) =>
    inputs.forEach((args) => window.describe(format(testName, args), () => test(args)))
window.test.todo = function todo() {
    return undefined
}
window.it.skip = window.xit
window.describe.skip = window.xdescribe

window.expect = expect
window.setImmediate = setTimeout
window.clearImmediate = clearTimeout
window.jest = jestMock
window.it.skip = window.xit
window.describe.skip = window.xdescribe
