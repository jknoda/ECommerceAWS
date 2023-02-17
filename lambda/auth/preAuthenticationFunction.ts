import { Callback, Context, PreAuthenticationTriggerEvent } from "aws-lambda";

export async function handler(event: PreAuthenticationTriggerEvent, contexto: Context, callback: Callback): Promise<void>{
    console.log(event)

    if (event.request.userAttributes.email === "jknoda@uol.com.br") {
        callback("User is blocked. Reason: teste", event)
    } else {
        callback(null, event) // calback "null" = sem erro
    }
}