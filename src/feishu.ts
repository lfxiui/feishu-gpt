import { config } from './config'
import { chatService } from './chat'
import * as lark from '@larksuiteoapi/node-sdk'
import { utils } from './utils'

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

    constructor(private msgId: string) {
        this.throttle = utils.getThrottlePro(700)
        this.throttle(async () => {
            const res = await client.im.message.reply({
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

    reply(text: string): void {
        this.answer = text
        this.throttle(async () => {
            const messageId = this.getCardMsgId()
            await client.im.message.patch({
                path: {
                    message_id: messageId,
                },
                data: makeMsgCard(
                    makeTextEle(text),
                    makeNoteEle('思考中，请稍等...'),
                )
            })
        })
    }

    final(): void {
        this.throttle(async () => {
            const text = this.getAnswer()
            const messageId = this.getCardMsgId()
            await client.im.message.patch({
                path: {
                    message_id: messageId,
                },
                data: makeMsgCard(
                    makeTextEle(text),
                )
            })
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
        const stream = chatService.chatStream(chat_id, question)
        const replyClient = new TextCardReplyClient(message_id)
        for await (const answer of stream) {
            replyClient.reply(answer)
        }
        replyClient.final()
    } catch (e) {
        console.error('feishu chat error', e)
    }
}

export const feishuService = {
    feishuChat: feishuChat,
}
