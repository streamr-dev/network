import {
    Route53Client,
    ListResourceRecordSetsCommand,
    ListResourceRecordSetsCommandOutput,
    ChangeResourceRecordSetsCommand,
    ChangeAction,
    RRType,
    ChangeResourceRecordSetsCommandOutput
} from '@aws-sdk/client-route-53'
import { Logger } from '@streamr/utils'

interface Record {
    fqdn: string 
    value: string
}

const logger = new Logger(module)
export class Route53Api {
    
    private hostedZoneId: string
    private client: Route53Client
    
    constructor(region: string, hostedZoneId: string) {
        this.hostedZoneId = hostedZoneId
        this.client = new Route53Client({ region })
    }

    public async changeRecords(
        action: ChangeAction,
        recordType: RRType,
        records: Record[],
        ttl: number
    ): Promise<ChangeResourceRecordSetsCommandOutput> {
        const input = {
            HostedZoneId: this.hostedZoneId,
            ChangeBatch: {
                Changes: records.map((record) => {
                    return {
                        Action: action,
                        ResourceRecordSet: {
                            Name: record.fqdn,
                            Type: recordType,
                            TTL: ttl,
                            ResourceRecords: [{
                                Value: record.value,
                            }]
                        }
                    }
                })
            }
        }
        const command = new ChangeResourceRecordSetsCommand(input)
        const response = await this.client.send(command)
       
        return response
    }

    public async upsertRecord(recordType: RRType, fqdn: string, value: string, ttl: number): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecords(ChangeAction.UPSERT, recordType, [ { fqdn, value } ], ttl)
    }

    public async deleteRecord(recordType: RRType, fqdn: string, value: string, ttl: number): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecords(ChangeAction.DELETE, recordType, [ { fqdn, value } ], ttl)
    }

    // Debugging tool to list all records in a zone
    public async listRecords(): Promise<ListResourceRecordSetsCommandOutput> {
        const input = {
            HostedZoneId: this.hostedZoneId,
        }
    
        const command = new ListResourceRecordSetsCommand(input)
        const response = await this.client.send(command)
        return response
    }

    // List all records in a zone with pagination support
    public async listAllRecords(): Promise<ListResourceRecordSetsCommandOutput[]> {
        const allResponses: ListResourceRecordSetsCommandOutput[] = []
        let startRecordName: string | undefined
        let startRecordType: RRType | undefined
        let isTruncated = true

        while (isTruncated) {
            const input: any = {
                HostedZoneId: this.hostedZoneId,
            }

            if (startRecordName) {
                input.StartRecordName = startRecordName
            }
            if (startRecordType) {
                input.StartRecordType = startRecordType
            }

            const command = new ListResourceRecordSetsCommand(input)
            const response = await this.client.send(command)
            
            allResponses.push(response)
            
            isTruncated = response.IsTruncated ?? false
            if (isTruncated) {
                startRecordName = response.NextRecordName
                startRecordType = response.NextRecordType
            }
        }

        return allResponses
    }

    // Query all records that point to a specific IP address (with pagination support)
    public async getRecordsByIpAddress(ipAddress: string): Promise<Record[]> {
        const allResponses = await this.listAllRecords()
        const matchingRecords: Record[] = []

        for (const response of allResponses) {
            if (response.ResourceRecordSets) {
                for (const recordSet of response.ResourceRecordSets) {
                    // Only check A records (which contain IP addresses)
                    if (recordSet.Type === RRType.A && recordSet.ResourceRecords) {
                        for (const resourceRecord of recordSet.ResourceRecords) {
                            if (resourceRecord.Value === ipAddress) {
                                matchingRecords.push({
                                    fqdn: recordSet.Name ?? '',
                                    value: resourceRecord.Value
                                })
                            }
                        }
                    }
                }
            }
        }

        return matchingRecords
    }

    // Remove all A records that point to a specific IP address
    public async deleteRecordsByIpAddress(ipAddress: string, ttl: number = 300): Promise<ChangeResourceRecordSetsCommandOutput | null> {
        const recordsToDelete = await this.getRecordsByIpAddress(ipAddress)
        logger.info('deleting records by ip address: ' + ipAddress, { recordsToDelete })
        if (recordsToDelete.length === 0) {
            return null // No records found to delete
        }

        return this.changeRecords(ChangeAction.DELETE, RRType.A, recordsToDelete, ttl)
    }
}
