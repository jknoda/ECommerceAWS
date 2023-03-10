import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { DynamoDB } from "aws-sdk"
import * as AWSXray from "aws-xray-sdk"
import { OrderEventDdb, OrderEventRepository } from "/opt/nodejs/orderEventsRepositoryLayer"

AWSXray.captureAWS(require("aws-sdk"))

const eventDdb = process.env.EVENTS_DDB!

const ddbClient = new DynamoDB.DocumentClient()
const orderEventsRepository = new OrderEventRepository(ddbClient, eventDdb)

export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    const email = event.queryStringParameters!.email!
    const eventType = event.queryStringParameters!.eventType

    if (eventType) {
        const orderEvents = await orderEventsRepository.getOrderEventsByEmailAndEventType(email, eventType)
        return {
            statusCode: 200,
            body: JSON.stringify(convertOrderEvent(orderEvents))
        }
    } else {
        const orderEvents = await orderEventsRepository.getOrderEventsByEmail(email)
        return {
            statusCode: 200,
            body: JSON.stringify(convertOrderEvent(orderEvents))
        }
    }
}

function convertOrderEvent(orderEvents: OrderEventDdb[]) {
    return orderEvents.map((orderEvent=>{
        return {
            email: orderEvent.email,
            createdAt: orderEvent.createdAt,
            eventType: orderEvent.eventType,
            requestId: orderEvent.requestId,
            orderId: orderEvent.info.orderId,
            productCodes: orderEvent.info.productCodes
        }
    }))
}