import tunnel from 'tunnel'
import { config } from './config'
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

async function* chatStream(
    user: string | any,
    message: string,
    hisLen?: number
): AsyncIterableIterator<string> {
    const contextLen = hisLen ?? 6
    let answer = ''
    try {
        const histories = await historyService.getChatHistoryLastThree(user, contextLen)
        const res = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [...histories, { role: 'user', content: message }],
            stream: true,
        }, {
            ...option,
            responseType: 'stream',
        })
        for await (const chunk of res.data) {
            const lines = chunk
                .toString('utf8')
                .split('\n')
                .filter((line: any) => line.trim().startsWith('data: '))

            for (const line of lines) {
                const text = line.replace(/^data: /, '')
                if (text === '[DONE]') {
                    return
                }

                try {
                    const json = JSON.parse(text)
                    const token = json.choices[0].delta.content
                    if (token) {
                        answer += token
                    }
                } catch (e) {
                    console.error('parse chatStream line error', text, e)
                    return
                }
            }
            yield answer
        }
    } catch (err: any) {
        if (contextLen > 0 && err?.response?.status && err.response.data) {
            try {
                for await (const chunk of err.response.data) {
                    const json = chunk
                        .toString()
                    const error = JSON.parse(json)?.error
                    // 上下文超出限制自动重试
                    if (error?.code === 'context_length_exceeded') {
                        console.warn(`context_length_exceeded retry(${contextLen})`)
                        yield* chatStream(user, message, contextLen - 1)
                    } else {
                        console.error(json)
                        if (!answer) {
                            yield '服务器出错了...'
                        }
                    }
                }
            } catch (e) {
                console.error(e)
                if (!answer) {
                    yield err2String(e)
                }
            }
        } else {
            console.error(err)
            const errMsg = (err as any)?.response?.data?.error?.message
            if (!answer) {
                yield (errMsg ?? err2String(err))
            }
        }
    } finally {
        if (answer) {
            historyService.addChatHistory({
                user,
                message,
                answer,
            }).catch(err => {
                console.error('添加历史出错', err)
            })
        }
    }
}

export const chatService = {
    chatStream: chatStream,
}
