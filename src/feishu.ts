import { config } from './config'
import { chatService } from './chat'
import * as lark from '@larksuiteoapi/node-sdk'
import { utils } from './utils'
import { ChatCompletionFunctions } from 'openai'
import { pluginService } from './plugin'
import { historyService } from './history'

const client = new lark.Client({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
})

type Element = {
    tag: 'div'
    text: {
        content: string
        tag: 'plain_text'
    }
} | {
    tag: 'markdown'
    content: string
} | {
    tag: 'note',
    elements: Array<{
        tag: 'plain_text'
        content: string
    }>
} | {
    tag: 'action'
    actions: [{
        tag: 'button',
        text: {
            tag: 'plain_text',
            content: string
        },
        type: 'default',
        value: Record<string, string>
    }]
}

function makeBtnEle(text: string, values: Record<string, string>): Element {
    return {
        tag: 'action',
        actions: [{
            tag: 'button',
            text: {
                content: text,
                tag: 'plain_text'
            },
            type: 'default',
            value: values
        }]
    }
}

function makeTextEle(content: string): Element {
    return {
        tag: 'div',
        text: {
            content: content,
            tag: 'plain_text'
        }
    }
}

function makeNoteEle(content: string): Element {
    return {
        tag: 'note',
        elements: [
            {
                tag: 'plain_text',
                content: content
            }
        ]
    }
}

function makeMsgCard(...elements: Element[]) {
    return {
        msg_type: 'interactive',
        content: JSON.stringify({
            config: {
                wide_screen_mode: true
            },
            elements: elements
        })
    }
}

class TextCardReplyClient {
    // 飞书接口有频率限制，所以做了节流
    throttle: (fun: () => Promise<void>) => void
    cardMsgId?: string
    answer = ''
    preElements: Element[] = []

    constructor(private msgId: string, private client: lark.Client) {
        this.throttle = utils.getThrottlePro(700)
        this.throttle(async () => {
            const res = await this.client.im.message.reply({
                path: {
                    message_id: this.msgId,
                },
                data: makeMsgCard(makeNoteEle('思考中，请稍等...'))
            })
            this.cardMsgId = res.data?.message_id
        })
    }

    getCardMsgId(): string {
        if (this.cardMsgId === undefined) {
            throw new Error(`TextCardReplyClient get card msg id error`)
        }
        return this.cardMsgId
    }

    getAnswer(): string {
        return this.answer
    }

    addPreElement(ele: Element): void {
        this.preElements.push(ele)
        this.throttle(async () => {
            const text = this.getAnswer()
            const messageId = this.getCardMsgId()
            try {
                await this.client.im.message.patch({
                    path: {
                        message_id: messageId,
                    },
                    data: makeMsgCard(
                        ...this.preElements,
                        makeTextEle(text),
                        makeNoteEle('思考中，请稍等...'),
                    )
                })
            } catch (e) {
                console.error('reply: 调用飞书服务出错', e)
            }
        })
    }

    reply(text: string): void {
        this.answer = text
        this.throttle(async () => {
            const messageId = this.getCardMsgId()
            try {
                await this.client.im.message.patch({
                    path: {
                        message_id: messageId,
                    },
                    data: makeMsgCard(
                        ...this.preElements,
                        makeTextEle(text),
                        makeNoteEle('思考中，请稍等...'),
                    )
                })
            } catch (e) {
                console.error('reply: 调用飞书服务出错', e)
            }
        })
    }

    final(elements?: Element[]): void {
        this.throttle(async () => {
            const text = this.getAnswer()
            const messageId = this.getCardMsgId()

            try {
                await this.client.im.message.patch({
                    path: {
                        message_id: messageId,
                    },
                    data: makeMsgCard(
                        ...this.preElements,
                        makeTextEle(text),
                        ...(elements ?? []),
                    )
                })
            } catch (e) {
                console.error('final: 调用飞书服务出错', messageId, e)
            }
        })
    }
}

async function replyText(msgId: string, text: string): Promise<void> {
    await client.im.message.reply({
        path: {
            message_id: msgId,
        },
        data: {
            msg_type: 'text',
            content: JSON.stringify({ text: text }),
        }
    })
}

const searchGoogleGptFunction: ChatCompletionFunctions = {
    name: 'search_google_when_gpt_cannot_answer',
    description: '当 gpt 遇到无法回答的或者需要搜索引擎协助回答时从 google 搜索',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '搜索句，支持中文或者英文',
            }
        },
    }
}

async function replyByGpt(params: {
    user: any
    question: string
    replyClient: TextCardReplyClient
}): Promise<void> {
    const { replyClient, question, user, } = params

    let srId: string | undefined

    async function* searchGoogle(json?: string): AsyncIterableIterator<string> {
        if (!json) {
            return
        }
        const args = JSON.parse(json)
        const query = args.query
        if (!query) {
            return
        }
        replyClient.addPreElement(makeNoteEle(`🔍联网搜索：${query}`))
        const searchRes = await pluginService.googleSearch(query)
        if (!searchRes) {
            return
        }
        const { result, type } = searchRes
        srId = await historyService.addSearchResult({
            ...searchRes,
            query: query,
            user: user,
            createTime: Date.now(),
        })
        const msg = `这是我的提问：${question}\n这是我在${type}搜索“${query}”的结果：\n${
            JSON.stringify(type === 'Google' ? result.map(s => ({
                title: s.title,
                snippet: s.snippet,
            })) : '')
        }\n请结合搜索结果回答`
        yield* chatService.chatStream(user, msg, 'gpt-4')
    }

    const stream = chatService.chatStream(
        user,
        question,
        'gpt-3.5-turbo-0613',
        config.google.apiKey && config.google.searchId
            ? {
                functions: [{
                    fun: searchGoogle,
                    gptFun: searchGoogleGptFunction
                }],
            }
            : undefined
    )
    for await (const answer of stream) {
        replyClient.reply(answer)
    }
    // 可以在卡片中增加一个按钮查看搜索结果，需要配置机器人才能实现
    // replyClient.final([makeBtnEle('查看搜索结果', { search_res: srId })])
    replyClient.final()
}

async function feishuChat(data: any): Promise<void> {
    const { content, message_id, chat_id, chat_type, mentions } = data.event.message
    const { text } = JSON.parse(content)
    if (!text || !chat_id || !message_id) {
        console.error('params error', JSON.stringify(data))
        if (message_id) {
            await replyText(message_id, 'ChatGPT目前不支持文本以外的输入。')
        }
        return
    }
    // 群聊中判断有没有被@
    if (chat_type === 'group') {
        if (!Array.isArray(mentions)) {
            return
        }
        if ((text as string).indexOf('@_all') > -1) {
            if (!mentions.some(m => m.name === config.feishu.applicationName)) {
                return
            }
        }
    }
    const question = text.replace(/@_user_\d+/gi, '').trim()
    try {
        const replyClient = new TextCardReplyClient(message_id, client)
        await replyByGpt({
            user: chat_id,
            question,
            replyClient,
        })
    } catch (e) {
        console.error('feishu chat error', e)
    }
}

export const feishuService = {
    feishuChat: feishuChat,
}
