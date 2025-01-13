import { Logger } from '@streamr/utils'
import { validateEnvironmentVariable } from '../src/AutoCertifierServer'
import { Database, Subdomain } from '../src/Database'
import { Route53Api } from '../src/Route53Api'
import { chunk } from 'lodash'
import { ChangeAction } from '@aws-sdk/client-route-53'
;(async () => {
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
            const batched = chunk(allSubdomains, 100)
            for (const batch of batched) {
                const records = batch.map((subdomain: Subdomain) => {
                    return {
                        fqdn: subdomain.subdomainName + '.' + domainName,
                        value: subdomain.ip
                    }
                })
                logger.info('upserting records to route53: ', { records })

                await route53Api.changeRecords(ChangeAction.UPSERT, 'A', records, 300)
            }
        }
    } catch (error) {
        logger.error(error)
    } finally {
        await database.stop()
    }
})()
