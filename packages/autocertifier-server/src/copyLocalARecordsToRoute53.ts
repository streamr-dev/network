import { Logger } from '@streamr/utils'
import { validateEnvironmentVariable } from './AutoCertifierServer'
import { Database } from './Database'
import { Route53Api } from './Route53Api'

(async () => {
    const logger = new Logger(module)
    
    const domainName = validateEnvironmentVariable('AUTOCERTIFIER_DOMAIN_NAME')
    const databaseFilePath = validateEnvironmentVariable('AUTOCERTIFIER_DATABASE_FILE_PATH')
    validateEnvironmentVariable('AWS_ACCESS_KEY_ID')
    validateEnvironmentVariable('AWS_SECRET_ACCESS_KEY')
    const route53Api = new Route53Api(
        validateEnvironmentVariable('AUTOCERTIFIER_ROUTE53_REGION'),
        validateEnvironmentVariable('AUTOCERTIFIER_ROUTE53_HOSTED_ZONE_ID')
    )
    const database = new Database(databaseFilePath)
    await database.start()
    logger.info('database is running on file ' + databaseFilePath)

    try {
        const allSubdomains = await database.getAllSubdomains()
        if (allSubdomains) {
            for (const subdomain of allSubdomains) {
                logger.info('upserting A record to route53: ' + subdomain.subdomainName + '.' + domainName + ' -> ' + subdomain.ip)
                await route53Api.upsertRecord('A', subdomain.subdomainName + '.' + domainName, subdomain.ip, 300)
            }
        }

    } catch (error) {
        logger.error(error)
    } finally {
        await database.stop()
    }
})()
