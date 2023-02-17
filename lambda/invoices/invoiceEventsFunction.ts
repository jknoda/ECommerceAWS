import { AttributeValue, Context, DynamoDBStreamEvent } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, EventBridge } from "aws-sdk";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";
import * as AWSXRaxy from "aws-xray-sdk"

AWSXRaxy.captureAWS(require("aws-sdk"))

const eventDdb = process.env.EVENTS_DDB!
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6)
const auditBusName = process.env.AUDIT_BUS_NAME!

const ddbClient = new DynamoDB.DocumentClient()
const apigwManangementApi = new ApiGatewayManagementApi({
    endpoint: invoiceWsApiEndpoint
})
const eventBridgeClient = new EventBridge()

const invoiceWsService = new InvoiceWSService(apigwManangementApi)

export async function handler(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    const promises: Promise<void>[] = []

    event.Records.forEach((record)=>{
        if (record.eventName === "INSERT") {
            if (record.dynamodb!.NewImage!.pk.S!.startsWith("#transaction")) {
                console.log("Invoice tranaction event received")
            } else {
                console.log("Invoice event received")
                promises.push(createEvent(record.dynamodb!.NewImage!,"INVOICE_CREATED"))
                
            }
        } else if (record.eventName === "MODIFY") {

        } else if (record.eventName === "REMOVE") {
            if (record.dynamodb!.OldImage!.pk.S === "#transaction"){
                console.log("Invoice transaction event remove")
                promises.push(processExpiredTransaction(record.dynamodb!.OldImage!))
            }
        }
    })

    await Promise.all(promises)

    return
}


async function processExpiredTransaction(invoiceTransactionImage: {[key: string]: AttributeValue}): Promise<void> {
    const transactionId = invoiceTransactionImage.sk.S!
    const connectionId = invoiceTransactionImage.connectionId.S!

    console.log(`TransactioId: ${transactionId} - ConnectionId: ${connectionId}`)

    if (invoiceTransactionImage.transactionStatus.S === "INVOICE_PROCESSED"){
        console.log("Invoice processed")
    } else {
        console.log(`Invoice import failed - Status: ${invoiceTransactionImage.transactionStatus.S}`)

        const putEventPromise = eventBridgeClient.putEvents({
            Entries: [
                {
                    Source: "app.invoice",
                    EventBusName: auditBusName,
                    DetailType: "invoice",
                    Time: new Date(),
                    Detail: JSON.stringify({
                        errorDetail: "TIMEOUT",
                        transactionId: transactionId
                    })
                }
            ]
        }).promise()

        const sendStatusPromise = invoiceWsService.sendInvoiceStatus(transactionId, connectionId, "TIMEOUT")
        
        await Promise.all([putEventPromise, sendStatusPromise])

        await invoiceWsService.disconnectClient(connectionId)
    }

}

async function createEvent(invoiceImage: {[key: string]: AttributeValue}, eventType: string) {
    const timestamp = Date.now()
    const ttl = ~~(timestamp/1000 + 60*60)

    await ddbClient.put({
        TableName: eventDdb,
        Item: {
            pk: `#invoice_${invoiceImage.sk.S}`, //#invoice_ABC-111
            sk: `${eventType}#${timestamp}`, //INVOICE_CREATED#111111
            ttl: ttl,
            email: invoiceImage.pk.S!.split('_')[1],
            createdAt: timestamp,
            eventType: eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.S,
                quantity: invoiceImage.quantity.N
            }
        }
    }).promise()

    return
}

