import { collections } from './mongo'
import { GptMsg } from './types'

async function addChatHistory(data: {
    user: any,
    message: any,
    answer: any,
}): Promise<void> {
    const { user, message, answer } = data
    await collections.chat_history.insertOne({
        answer: answer,
        user: user,
        send: message,
        createTime: Date.now(),
    })
}

async function getChatHistoryLastFive(user: any, limit: number): Promise<GptMsg[]> {
    const histories = await collections.chat_history
        .find({
            user: user,
        })
        .sort({ createTime: -1 })
        .limit(limit)
        .toArray()
    const msgList: GptMsg[] = []
    for (const history of histories.reverse()) {
        msgList.push({
            role: 'user',
            content: history.send,
        })
        if (history.answer) {
            msgList.push({
                role: 'assistant',
                content: history.answer,
            })
        }
    }
    return msgList
}

async function clearChatHistory(user: any): Promise<void> {
    const res = await collections.chat_history
        .deleteMany({
            user: user,
        })
    console.log(JSON.stringify(res))
}

export const historyService = {
    addChatHistory: addChatHistory,
    getChatHistoryLastThree: getChatHistoryLastFive,
    clearChatHistory: clearChatHistory,
}
