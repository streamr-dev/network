import Debug from 'debug'

export default () => {
    if (process.env.DEBUG_CONSOLE) {
        // Use debug as console log
        // This prevents jest messing with console output
        // Ensuring debug messages are printed alongside console messages, in the correct order
        console.log = Debug('Streamr::CONSOLE') // eslint-disable-line no-console
    }
}
