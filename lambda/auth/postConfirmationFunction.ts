import { Callback, Context, PostConfirmationConfirmSignUpTriggerEvent } from "aws-lambda";

export async function handler(event: PostConfirmationConfirmSignUpTriggerEvent, context: Context, callback: Callback): Promise<void>{

    console.log(event)

    callback(null, event)
}