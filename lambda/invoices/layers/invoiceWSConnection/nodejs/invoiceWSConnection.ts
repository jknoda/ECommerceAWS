import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
    private apigwManangementApi: ApiGatewayManagementApi

    constructor(apigwManagementApi: ApiGatewayManagementApi) {
        this.apigwManangementApi = apigwManagementApi
    }

    sendInvoiceStatus(transactionId: string, connectionId: string, status: string) {
        const postData = JSON.stringify({
            transactionId: transactionId,
            status: status
        })
        return this.sendData(connectionId, postData)
    }

    async disconnectClient(connectionId: string): Promise<boolean> {
        try {
            await this.apigwManangementApi.getConnection({
                ConnectionId: connectionId
            }).promise() 
            await this.apigwManangementApi.deleteConnection({
                ConnectionId: connectionId
            }).promise()
            return true
        } catch(err){
            console.error(err)
            return false
        }
    }

    async sendData(connectionId: string, data: string): Promise<boolean> {

        try {
            await this.apigwManangementApi.getConnection({
                ConnectionId: connectionId
            }).promise() // se não estiver conectado um erro será lançado - throw erro

            await this.apigwManangementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise()

            return true
        } catch(err){
            console.error(err)
            return false
        }
    }
}