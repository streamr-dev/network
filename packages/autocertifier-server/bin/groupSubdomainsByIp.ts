import { Logger } from '@streamr/utils'
import { validateEnvironmentVariable } from '../src/AutoCertifierServer'
import { Database, Subdomain } from '../src/Database'

interface GroupedSubdomains {
    [ipAddress: string]: Subdomain[]
}

(async () => {
    const logger = new Logger(module)
    
    const databaseFilePath = validateEnvironmentVariable('AUTOCERTIFIER_DATABASE_FILE_PATH')
    const database = new Database(databaseFilePath)
    await database.start()
    logger.info('Database is running on file ' + databaseFilePath)

    try {
        const allSubdomains = await database.getAllSubdomains()
        if (!allSubdomains || allSubdomains.length === 0) {
            logger.info('No subdomains found in database')
            return
        }

        // Group subdomains by IP address
        const groupedSubdomains: GroupedSubdomains = {}
        
        for (const subdomain of allSubdomains) {
            if (!groupedSubdomains[subdomain.ip]) {
                groupedSubdomains[subdomain.ip] = []
            }
            groupedSubdomains[subdomain.ip].push(subdomain)
        }

        // Sort each group by createdAt timestamp (newest first)
        for (const ip in groupedSubdomains) {
            groupedSubdomains[ip].sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
                return dateB - dateA // Newest first (descending order)
            })
        }

        // Display results
        logger.info('Subdomains grouped by IP address (sorted by creation time, newest first):')
        logger.info('='.repeat(80))
        
        for (const [ip, subdomains] of Object.entries(groupedSubdomains)) {
            logger.info(`\nIP Address: ${ip} (${subdomains.length} subdomain${subdomains.length === 1 ? '' : 's'})`)
            logger.info('-'.repeat(50))
            
            subdomains.forEach((subdomain, index) => {
                const createdAt = subdomain.createdAt 
                    ? new Date(subdomain.createdAt).toISOString()
                    : 'Unknown'
                
                logger.info(`  ${index + 1}. ${subdomain.subdomainName}`)
                logger.info(`     Port: ${subdomain.port}`)
                logger.info(`     Created: ${createdAt}`)
                logger.info(`     Token: ${subdomain.token.substring(0, 8)}...`)
                if (subdomain.acmeChallenge) {
                    logger.info(`     ACME Challenge: ${subdomain.acmeChallenge.substring(0, 20)}...`)
                }
                logger.info('')
            })
        }

        // Summary statistics
        const totalIpAddresses = Object.keys(groupedSubdomains).length
        const totalSubdomains = allSubdomains.length
        logger.info('='.repeat(80))
        logger.info(`Summary: ${totalSubdomains} total subdomains across ${totalIpAddresses} IP addresses`)

    } catch (error) {
        logger.error('Error querying subdomains:', error)
    } finally {
        await database.stop()
    }
})()

