import pino from 'pino'

export const getLogger = (name: string) => pino({
    name,
    enabled: !process.env.NOLOG,
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV === 'production' ? false : {
        colorize: true,
        translateTime: true
    }
})