const ONE_SECOND = 1000

/**
 * Utility to analyze some throughput rate.
 * 
 * Call record(value) to provide the input to the utility. The value parameter tells how many units
 * of some data have just been processed. It is not a cumulative value, but a count of the most
 * recently processed units. 
 *   
 * E.g. if you send a total of 1000 messages, you could call record(1) after each message. Or you could 
 * call record(msg.getSizeInBytes()) after each message to provide the data for a bytes per second 
 * throughput rate.
 * 
 * At any time you can call getRate() to get the current throughput rate per second. 
 * 
 * The utility uses n second window to store the recorded data. If less than n seconds have been elapsed
 * from the construction of the utility, the shorter window is used temporarily.
 * 
 * Internally the window is divided into one-second slots, each containing one UTC second of data. There are 
 * windowSize + 1 slots: the first slot contains data for the current UTC second, and the last slot
 * contains data that has already partially expired. E.g. if 0.1 seconds has elapsed from a start of a UTC second,
 * the first slot can contain maximum 0.1 seconds of recorded data (as there can't be data for any future
 * timestamps). In that situation, we include 90% of the value from oldest slot to complement the 
 * partial first slot. 
 */

export class Speedometer {

    private static WINDOW_SIZE_DEFAULT = 5

    // The first item contains a value for UTC second firstSecStartTime and items after that are consecutive 
    // seconds in descending order (windowSizeInSeconds items). The last item of an array is at least 
    // partially out of the window
    private secValues: number[]
    // UTC time of a second (millisecond part always 0)
    private firstSecStartTime: number
    private startupTime: number
    private readonly windowSizeInSeconds: number
    // CurrentTimeProvider is used only for unit tests
    private readonly currentTimeProvider: () => number

    constructor(windowSizeInSeconds = Speedometer.WINDOW_SIZE_DEFAULT, currentTimeProvider = () => Date.now()) {
        this.secValues = new Array(windowSizeInSeconds + 1).fill(0)
        this.firstSecStartTime = 0
        this.startupTime = currentTimeProvider()
        this.windowSizeInSeconds = windowSizeInSeconds
        this.currentTimeProvider = currentTimeProvider
    }

    record(value: number): void {
        const now = this.currentTimeProvider()
        this.update(now)
        this.secValues[0] += value
    }

    getRate(): number {
        const now = this.currentTimeProvider()
        this.update(now)
        const fraction = now % ONE_SECOND
        // Include windowSizeInSeconds slots fully, and the last item partially. It is ok to calculate 
        // the most recent sec fully, as it is implictly a partial value (e.g. if we produce 10 units 
        // per second, and 0.1 seconds have elapsed, there is about 1 unit in the first slot)
        let sum = 0
        for (let i = 0; i < this.windowSizeInSeconds; i++) {
            sum += this.secValues[i]
        }
        sum += this.secValues[this.windowSizeInSeconds] * (1 - (fraction / ONE_SECOND))
        // Normally the sum is divided by windowSizeInSeconds, but just after the startup we
        // calculate the divider based on the elapsed time from the startup. In that situation
        // the divider will be between 1 and windowSizeInSeconds - 1
        const warmupEndTime = this.startupTime + this.windowSizeInSeconds * ONE_SECOND
        const divider = (now >= warmupEndTime) ? this.windowSizeInSeconds : Math.max(Math.round((now - this.startupTime) / ONE_SECOND), 1)
        return sum / divider
    }

    // Update the secValues and firstSecStartTime to reflect the current timestamp
    private update(now: number) {
        const needsUpdate = now >= (this.firstSecStartTime + ONE_SECOND)
        if (needsUpdate) {
            const elapsedSecondCount = Math.floor((now - this.firstSecStartTime) / ONE_SECOND)
            if (elapsedSecondCount < this.windowSizeInSeconds + 1) {
                const shiftCount = this.windowSizeInSeconds - elapsedSecondCount + 1
                for (let i = shiftCount - 1; i >= 0; i--) {
                    this.secValues[i + elapsedSecondCount] = this.secValues[i]
                }
            }
            this.secValues.fill(0, 0, Math.min(elapsedSecondCount, this.windowSizeInSeconds + 1))
            this.firstSecStartTime = now - (now % ONE_SECOND)
        }
    }
}