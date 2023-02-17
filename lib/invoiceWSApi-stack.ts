import * as cdk from "aws-cdk-lib"
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha"
import * as apigetewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3n from "aws-cdk-lib/aws-s3-notifications"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources"
import * as events from "aws-cdk-lib/aws-events"
import { Construct } from "constructs"

interface InvoiceWSApiStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table,
    auditBus: events.EventBus
}

export class InvoiceWSApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: InvoiceWSApiStackProps) {
        super(scope, id, props)

        // Invoice Transaction Layer
        const invoiceTransactionLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceTransactionLayerVersionArn")
        const invoiceTransactionLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceTransactionLayer", invoiceTransactionLayerArn)

        // Invoice Layer
        const invoiceLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceRepositoryLayerVersionArn")
        const invoiceLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceRepositoryLayer", invoiceLayerArn)

        // Invoice WebSocket API Layer
        const invoiceWSConnectionLayerArn = ssm.StringParameter.valueForStringParameter(this, "InvoiceWSConnectionLayerVersionArn")
        const invoiceWSConnectionLayer = lambda.LayerVersion.fromLayerVersionArn(this, "InvoiceWSConnectionLayer", invoiceWSConnectionLayerArn)

        //Invoice and invoce transaction DDB
        const invoiceDdb = new dynamodb.Table(this, "InvoicesDdb", {
            tableName: "invoices",
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: "ttl",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        })

        //Invoice bucket
        const bucket = new s3.Bucket(this, "InvoiceBucket", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(1)
                }
            ]
        })

        //WebSocket connection handler
        const connectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceConnectionFunction", {
            functionName: "InvoiceConnectionFunction",
            entry: "lambda/invoices/invoiceConnectionFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
        })  

        //WebSocket disconnection handler
        const disconnectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceDisconnectionFunction", {
            functionName: "InvoiceDisconnectionFunction",
            entry: "lambda/invoices/invoiceDisconnectionFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
        })  

        //WebSocket API
        const webSocketApi = new apigatewayv2.WebSocketApi(this, "InvoiceWSApi", {
            apiName: "InvoiceWSApi",
            connectRouteOptions: {
                integration: 
                    new apigetewayv2_integrations.WebSocketLambdaIntegration("ConnectionHandler", connectionHandler)
            },
            disconnectRouteOptions: {
                integration:
                    new apigetewayv2_integrations.WebSocketLambdaIntegration("DisconnectionHandler", disconnectionHandler)
            }
        })

        const stage = "prod"
        const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`
        new apigatewayv2.WebSocketStage(this, "InvoiceWSApiStage", {
            webSocketApi: webSocketApi,
            stageName: stage,
            autoDeploy: true
        })

        //Invoice URL handler
        const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceGetUrlFunction", {
            functionName: "InvoiceGetUrlFunction",
            entry: "lambda/invoices/invoiceGetUrlFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoiceDdb.tableName,
                BUCKET_NAME: bucket.bucketName, // não foi definido, cdk nomeia automaticamente
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })  
        const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [invoiceDdb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb.LeadingKeys": ["#transaction"]
                }
            }
        })
        const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:PutObject"],
            resources: [`${bucket.bucketArn}/*`] 
        })
        getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy)
        getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy)
        webSocketApi.grantManageConnections(getUrlHandler)

        //Invoice import handler
        const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceImportFunction", {
            functionName: "InvoiceImportFunction",
            entry: "lambda/invoices/invoiceImportFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceLayer, invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoiceDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            }
        })  
        props.auditBus.grantPutEventsTo(invoiceImportHandler)
        invoiceDdb.grantReadWriteData(invoiceImportHandler)

        bucket.addEventNotification(s3.EventType.OBJECT_CREATED_PUT, new s3n.LambdaDestination(invoiceImportHandler))

        const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:DeleteObject", "s3:GetObject"],
            resources: [`${bucket.bucketArn}/*`] 
        })
        invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy)
        webSocketApi.grantManageConnections(invoiceImportHandler)

        //Cancel import handler
        const cancelImportHandler = new lambdaNodeJS.NodejsFunction(this, "CancelImportFunction", {
            functionName: "CancelImportFunction",
            entry: "lambda/invoices/cancelImportFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                INVOICE_DDB: invoiceDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })  
        const invoicesDdbReadWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:UpdateItem","dynamodb:GetItem"],
            resources: [invoiceDdb.tableArn],
            conditions: {
                ["ForAllValues:StringLike"]: {
                    "dynamodb.LeadingKeys": ["#transaction"]
                }
            }
        })
        cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionPolicy)
        webSocketApi.grantManageConnections(cancelImportHandler)

        //WebSocket API routes
        webSocketApi.addRoute("getImportUrl", {
            integration: new apigetewayv2_integrations.WebSocketLambdaIntegration("GetUrlHandler", getUrlHandler)
        })

        webSocketApi.addRoute("cancelImport", {
            integration: new apigetewayv2_integrations.WebSocketLambdaIntegration("CancelImportHandler", cancelImportHandler)
        })

        const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceEventsFunction", {
            functionName: "InvoiceEventsFunction",
            entry: "lambda/invoices/invoiceEventsFunction.ts",
            handler: "handler",
            memorySize: 128,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            },
            layers: [invoiceWSConnectionLayer]
        })  
        props.auditBus.grantPutEventsTo(invoiceEventsHandler)
        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
               ['ForAllValues:StringLike']: {
                  'dynamodb:LeadingKeys': ['#invoice_*']
               }
            }
        })
        invoiceEventsHandler.addToRolePolicy(eventsDdbPolicy)
        webSocketApi.grantManageConnections(invoiceEventsHandler)

        const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq", {
            queueName: "invoice-events-dlq"
        })

        invoiceEventsHandler.addEventSource(new lambdaEventSources.DynamoEventSource(invoiceDdb, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON, // a partir do ultimo evento
            batchSize: 5,
            bisectBatchOnError: true, // erro no batch - dividir o lote
            onFailure: new lambdaEventSources.SqsDlq(invoiceEventsDlq),
            retryAttempts: 3 // envia para dlq apos 3 tentativas
        }))
    }
}

