import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as iam from "aws-cdk-lib/aws-iam"
import * as sqs from "aws-cdk-lib/aws-sqs"

import {Construct} from "constructs"

interface ProductsAppStackProps extends cdk.StackProps{
    eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction
    readonly productsAdminHandler: lambdaNodeJS.NodejsFunction
    readonly productsDdb: dynamodb.Table

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props)

        this. productsDdb = new dynamodb.Table(this, "ProductsDdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY, // destroy quando destruir a stack
            partitionKey: {
                name: "id",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })

        // Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersonArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        // Products Events Layer
        const productsEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsEventsLayerVersonArn")
        const productsEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsEventsLayerVersionArn", productsEventsLayerArn)

        //Auth user infor layer
        const authUserInfoLayerArn = ssm.StringParameter.valueForStringParameter(this, "AuthInforLayerVersionArn")
        const authUserInforLayer = lambda.LayerVersion.fromLayerVersionArn(this, "AuthInforLayerVersionArn", authUserInfoLayerArn)

        const dlq = new sqs.Queue(this, "ProductEventDlq",{
            queueName: "product-events-dlq",
            retentionPeriod: cdk.Duration.days(10)
        })
        const productEventsHandler = new lambdaNodeJS.NodejsFunction(this, 
            "ProductsEventsFunction", {
                functionName: "ProductsEventsFunction",
                entry: "lambda/products/productsEventsFunction.ts",
                handler: "handler",
                memorySize: 128,
                timeout: cdk.Duration.seconds(2),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    EVENTS_DDB: props.eventsDdb.tableName
                },
                layers: [
                    productsEventsLayer
                ],
                tracing: lambda.Tracing.ACTIVE,
                deadLetterQueue: dlq,
                deadLetterQueueEnabled: true,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        //props.eventsDdb.grantWriteData(productEventsHandler)
        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
               ['ForAllValues:StringLike']: {
                  'dynamodb:LeadingKeys': ['#product_*']
               }
            }
        })
        productEventsHandler.addToRolePolicy(eventsDdbPolicy)

        this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(this, 
            "ProductsFetchFunction", {
                functionName: "ProductsFetchFunction",
                entry: "lambda/products/productsFetchFunction.ts",
                handler: "handler",
                memorySize: 128,
                timeout: cdk.Duration.seconds(5),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName
                },
                layers: [productsLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        this.productsDdb.grantReadData(this.productsFetchHandler)

        this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(this, 
            "ProductsAdminFunction", {
                functionName: "ProductsAdminFunction",
                entry: "lambda/products/productsAdminFunction.ts",
                handler: "handler",
                memorySize: 128,
                timeout: cdk.Duration.seconds(5),
                bundling: {
                    minify: true,
                    sourceMap: false
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName,
                    PRODUCTS_EVENTS_FUNCTION_NAME: productEventsHandler.functionName
                },
                layers: [productsLayer,productsEventsLayer,authUserInforLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        this.productsDdb.grantWriteData(this.productsAdminHandler)
        productEventsHandler.grantInvoke(this.productsAdminHandler)
    }
}