import { ChatCompletionFunctions, ChatCompletionRequestMessageFunctionCall } from 'openai'

export type GptMsg = {
    role: 'user' | 'assistant' | 'system'
    content: string | null
    function_call?: ChatCompletionRequestMessageFunctionCall
}

export type ChatModel = 'gpt-4' | 'gpt-4-0613' | 'gpt-3.5-turbo' | 'gpt-3.5-turbo-16k' | 'gpt-3.5-turbo-0613'

export interface ChatFunction {
    gptFun: ChatCompletionFunctions
    fun: (json?: string) => AsyncIterableIterator<string>
}
