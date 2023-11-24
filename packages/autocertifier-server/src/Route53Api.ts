import {
    Route53Client, ListResourceRecordSetsCommand, ListResourceRecordSetsCommandOutput,
    ChangeResourceRecordSetsCommand, ChangeAction, RRType,
    ChangeResourceRecordSetsCommandOutput
} from '@aws-sdk/client-route-53'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class Route53Api {
    
    private hostedZoneId: string
    private client: Route53Client
    
    constructor(hostedZoneId: string, region = 'EU-NORTH-1' ) {
        this.hostedZoneId = hostedZoneId
        this.client = new Route53Client({ region })
    }

    private async changeRecord(action: ChangeAction, recordType: RRType, fqdn: string, 
        value: string, ttl: number): Promise<ChangeResourceRecordSetsCommandOutput> {
        logger.trace(`Changing record ${recordType} ${fqdn} to ${value}`)
        const input = {
            HostedZoneId: this.hostedZoneId,
            ChangeBatch: {
                Changes: [
                    {
                        Action: action,
                        ResourceRecordSet: {
                            Name: fqdn,
                            Type: recordType,
                            TTL: ttl,
                            ResourceRecords: [
                                {
                                    Value: value,
                                },
                            ],
                        },
                    },
                ],
            },
        }
    
        const command = new ChangeResourceRecordSetsCommand(input)
        const response = await this.client.send(command)
        logger.trace(`Record ${recordType} ${fqdn} changed to ${value}`, { response })
        return response
    }

    public async upsertRecord(recordType: RRType, fqdn: string, value: string, ttl: number): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecord(ChangeAction.UPSERT, recordType, fqdn, value, ttl)
    }

    public async deleteRecord(recordType: RRType, fqdn: string, value: string, ttl: number): Promise<ChangeResourceRecordSetsCommandOutput> {
        return this.changeRecord(ChangeAction.DELETE, recordType, fqdn, value, ttl)
    }

    public async listRecords(): Promise<ListResourceRecordSetsCommandOutput> {
        const input = {
            HostedZoneId: this.hostedZoneId,
        }
    
        const command = new ListResourceRecordSetsCommand(input)
        const response = await this.client.send(command)
        return response
    }
}
