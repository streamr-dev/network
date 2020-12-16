import pino from "pino"

export default function getLogger(name: string): pino.Logger {
    return pino({
        name,
        enabled: !process.env.NOLOG,
        level: process.env.LOG_LEVEL || 'info',
        prettyPrint: process.env.NODE_ENV === 'production' ? false : {
            colorize: true,
            translateTime: true
        }
    })
}
