// Add important parts of Jest to the Karma/Jasmine browser-test runtime's global scope
// the jest.fn() API
import * as jestMock from 'jest-mock'
import { ModernFakeTimers } from '@jest/fake-timers'
// The matchers API
import expect from 'expect'

let jest = jestMock
const timers = new ModernFakeTimers({global: window, config: null })

jest.advanceTimersByTime = timers.advanceTimersByTime
jest.advanceTimersToNextTimer = timers.advanceTimersToNextTimer
jest.clearAllTimers = timers.clearAllTimers
jest.dispose = timers.dispose
jest.getRealSystemTime = timers.getRealSystemTime
jest.getTimerCount = timers.getTimerCount
jest.reset = timers.reset
jest.runAllTicks = timers.runAllTicks
jest.runAllTimers = timers.runAllTimers
jest.runOnlyPendingTimers = timers.runOnlyPendingTimers
jest.setSystemTime = timers.setSystemTime
jest.useFakeTimers = timers.useFakeTimers
jest.useRealTimers = timers.useRealTimers

// eslint-disable-next-line no-underscore-dangle
jest._checkFakeTimers = timers._checkFakeTimers

Object.assign(jest,timers)

// Add missing Jest functions
window.test = window.it
window.test.each = (inputs) => (testName, test) =>
    inputs.forEach((args) => window.it(testName, () => test(...args)))
window.test.todo = function () {
    return undefined
}
window.jest = jest
window.expect = expect
