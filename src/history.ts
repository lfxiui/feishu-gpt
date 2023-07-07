import { collections, SearchResult } from './mongo'
import { GptMsg } from './types'
import { ChatCompletionRequestMessageFunctionCall } from 'openai'
import { ObjectId } from 'mongodb'

function addChatHistory(data: {
    user: any,
    message: any,
    answer?: any,
    function_call?: ChatCompletionRequestMessageFunctionCall
}): Promise<any> {
    const { user, message, answer, function_call, } = data
    return collections.chat_history.insertOne({
        answer: answer,
        user: user,
        send: message,
        function_call: function_call,
        createTime: Date.now(),
    })
}

function addChatHistoryQuietly(data: {
    user: any,
    message: any,
    answer?: any,
    function_call?: ChatCompletionRequestMessageFunctionCall
}): void {
    addChatHistory(data).catch(err => {
        console.error('添加历史出错', err)
    })
}

async function getLastChatHistory(user: any, limit: number): Promise<GptMsg[]> {
    const histories = await collections.chat_history
        .find({
            user: user,
        })
        .sort({ createTime: -1 })
        .limit(limit)
        .toArray()
    const msgList: GptMsg[] = []
    for (const history of histories.reverse()) {
        const send = history.send
        if (Array.isArray(send)) {
            for (const ele of send) {
                msgList.push(ele)
            }
        } else {
            msgList.push({
                role: 'user',
                content: send,
            })
        }

        if (history.answer || history.function_call) {
            msgList.push({
                role: 'assistant',
                content: history.answer ?? null,
                function_call: history.function_call ?? undefined,
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

async function addSearchResult(sr: SearchResult): Promise<string> {
    const res = await collections.searchResult
        .insertOne(sr)
    return res.insertedId.toString()
}

async function getSearchRes(id: string) {
    return await collections.searchResult
        .findOne({
            _id: new ObjectId(id)
        })
}

export const historyService = {
    addChatHistory: addChatHistory,
    getLastChatHistory: getLastChatHistory,
    clearChatHistory: clearChatHistory,
    addChatHistoryQuietly: addChatHistoryQuietly,
    addSearchResult: addSearchResult,
    getSearchRes: getSearchRes,
}
