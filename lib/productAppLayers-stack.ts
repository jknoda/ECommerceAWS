import * as cdk from "aws-cdk-lib"
import {Construct} from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as ssm from "aws-cdk-lib/aws-ssm"

export class ProductsAppLayersStack extends cdk.Stack{

    constructor(scope: Construct, id: string, props?: cdk.StackProps){
        super(scope, id, props)

        const productsLayers = new lambda.LayerVersion(this, "ProductsLayer", {
            code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "ProductsLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN // pois pode ser utilizada em outras stacks
        })
        new ssm.StringParameter(this, "ProductsLayerVersionArn", {
            parameterName: "ProductsLayerVersonArn",
            stringValue: productsLayers.layerVersionArn
        })

        const productsEventsLayers = new lambda.LayerVersion(this, "ProductsEventsLayer", {
            code: lambda.Code.fromAsset('lambda/products/layers/productsEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: "ProductsEventLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN // pois pode ser utilizada em outras stacks
        })
        new ssm.StringParameter(this, "ProductsEVentsLayerVersionArn", {
            parameterName: "ProductsEventsLayerVersonArn",
            stringValue: productsEventsLayers.layerVersionArn
        })
    }
}
