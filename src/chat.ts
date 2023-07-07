import tunnel from 'tunnel'
import { config } from './config'
import { ChatCompletionRequestMessageFunctionCall, CreateChatCompletionRequestFunctionCall } from 'openai'
import { ChatFunction, ChatModel, GptMsg } from './types'
import { historyService } from './history'

const { Configuration, OpenAIApi } = require('openai')
const configuration = new Configuration({
    apiKey: config.apiKey,
})
const openai = new OpenAIApi(configuration)

const agent = config.proxy ? tunnel.httpsOverHttp({
    proxy: {
        host: '127.0.0.1',
        port: 4780,
    }
}) : undefined

const option = agent ? {
    httpsAgent: agent,
    proxy: false,
} : undefined

function err2String(err: unknown): string {
    return err instanceof Error ? err.message + '\n' + err.stack : JSON.stringify(err)
}

async function* onChatStreamErr(params: {
    err: any
    noAnswer: boolean
    retry?: () => AsyncIterableIterator<string>
}): AsyncIterableIterator<string> {
    const { noAnswer, err, retry, } = params
    if (retry && err?.response?.status && err.response.data) {
        try {
            for await (const chunk of err.response.data) {
                const json = chunk
                    .toString()
                const error = JSON.parse(json)?.error
                if (error?.code === 'context_length_exceeded') {
                    console.warn(`context_length_exceeded retry`)
                    yield* retry()
                } else {
                    console.error(json)
                    if (noAnswer) {
                        yield '服务器出错了，请联系开发人员...'
                    }
                }
            }
        } catch (e) {
            console.error(e)
            if (noAnswer) {
                yield err2String(e)
            }
        }
    } else {
        console.error(err)
        const errMsg = (err as any)?.response?.data?.error?.message
        if (noAnswer) {
            yield (errMsg ?? err2String(err))
        }
    }
}

async function* handleGptStreamRes(res: any): AsyncIterableIterator<string | ChatCompletionRequestMessageFunctionCall> {
    let hasFunctionCall = false
    let functionName = ''
    let functionArguments = ''
    readData: for await (const chunk of res.data) {
        const lines = chunk
            .toString()
            .split('\n\n')
            .filter((line: any) => line.trim().startsWith('data: '))

        let text = ''
        for (const line of lines) {
            const data = line.replace(/^data: /, '').trim()
            if (data === '[DONE]') {
                break readData
            }

            try {
                const json = JSON.parse(data)
                const delta = json.choices[0].delta
                const functionCall = delta.function_call
                if (functionCall) {
                    hasFunctionCall = true
                    if (functionCall.name) {
                        functionName = functionCall.name
                    }
                    if (functionCall.arguments) {
                        functionArguments += functionCall.arguments
                    }
                } else {
                    const token = delta.content
                    if (token) {
                        text += token
                    }
                }
            } catch (e) {
                console.error('parse chatStreamWithRetry line error', data, e)
                break readData
            }
        }
        if (text) {
            yield text
        }
    }
    if (hasFunctionCall) {
        yield {
            name: functionName,
            arguments: functionArguments,
        }
    }
}

async function* chatStreamWithRetry(
    user: string | any,
    histories: GptMsg[],
    question: string,
    model: ChatModel,
    fun?: {
        functions?: ChatFunction[]
        function_call?: CreateChatCompletionRequestFunctionCall
    }
): AsyncIterableIterator<string> {
    const messages: GptMsg[] = [...histories, { role: 'user', content: question }]
    let answer = ''
    try {
        const res = await openai.createChatCompletion({
            model: model,
            messages: messages,
            stream: true,
            functions: fun?.functions?.map(f => f.gptFun),
            function_call: fun?.function_call,
        }, {
            responseType: 'stream',
        })
        const stream = handleGptStreamRes(res)
        for await (const chunk of stream) {
            if (typeof chunk === 'string') {
                answer += chunk
                yield answer
            } else {
                await historyService.addChatHistory({
                    user,
                    message: question,
                    function_call: chunk,
                })
                const _function = fun?.functions
                    ?.find(f => f.gptFun.name === chunk.name)
                    ?.fun
                if (_function) {
                    yield* _function(chunk.arguments)
                }
            }
        }
    } catch (err: any) {
        yield* onChatStreamErr({
            retry: histories.length <= 0
                ? undefined
                : () => chatStreamWithRetry(user, histories.slice(2), question, model, fun),
            err: err,
            noAnswer: !answer,
        })
    } finally {
        if (answer) {
            historyService.addChatHistoryQuietly({
                user,
                message: question,
                answer,
            })
        }
    }
}

async function* chatStream(
    user: string | any,
    question: string,
    chatModel?: ChatModel,
    fun?: {
        functions?: ChatFunction[]
        function_call?: CreateChatCompletionRequestFunctionCall
    }
): AsyncIterableIterator<string> {
    const model = chatModel ?? 'gpt-3.5-turbo'
    const histories = await historyService.getLastChatHistory(user, 6)
    yield* chatStreamWithRetry(
        user,
        histories,
        question,
        model,
        fun,
    )
}

export const chatService = {
    chatStream: chatStream,
}
