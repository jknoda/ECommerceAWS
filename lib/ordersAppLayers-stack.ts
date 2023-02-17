import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as ssm from "aws-cdk-lib/aws-ssm"

export class OrdersAppLayersStack extends cdk.Stack{
    constructor(scope: Construct, id:string, props?:cdk.StackProps){
        super(scope, id, props)

        const ordersLayer = new lambda.LayerVersion(this, "OrdersLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "OrdersLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersLayersVersionArn", {
            parameterName: "OrdersLayersVersionArn",
            stringValue: ordersLayer.layerVersionArn
        })


        const ordersApiLayer = new lambda.LayerVersion(this, "OrdersApiLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersApiLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "OrdersApiLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersApiLayersVersionArn", {
            parameterName: "OrdersApiLayersVersionArn",
            stringValue: ordersApiLayer.layerVersionArn
        })

        const ordersEventsLayer = new lambda.LayerVersion(this, "OrdersEventsLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "OrdersEventsLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersEventsLayersVersionArn", {
            parameterName: "OrdersEventsLayersVersionArn",
            stringValue: ordersEventsLayer.layerVersionArn
        })

        const ordersEventsRepositoryLayer = new lambda.LayerVersion(this, "OrdersEventsRepositoryLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersEventsRepositoryLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "OrdersEventsRepositoryLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersEventsRepositoryLayersVersionArn", {
            parameterName: "OrdersEventsRepositoryLayersVersionArn",
            stringValue: ordersEventsRepositoryLayer.layerVersionArn
        })        

    }
}
