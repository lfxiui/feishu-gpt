import { config } from './config'
import { Collection, Document, MongoClient } from 'mongodb'
import { ChatCompletionRequestMessageFunctionCall } from 'openai'
import { GptMsg } from './types'
import { customsearch_v1 } from 'googleapis'

export interface ChatHistory extends Document {
    user: any
    createTime: number
    send: string | GptMsg[]
    answer?: string
    function_call?: ChatCompletionRequestMessageFunctionCall
}

interface SearchResultBase extends Document {
    query: string
    createTime: number
    user: any
}

export interface GoogleSearchResult extends SearchResultBase {
    type: 'Google'
    result: customsearch_v1.Schema$Result[]
}

export type SearchResult = GoogleSearchResult

/*方便类型转换的类，没有实际使用*/
class CollContainer<T> {
}

const allColl = {
    chat_history: new CollContainer<ChatHistory>(),
    searchResult: new CollContainer<SearchResult>(),
} as const

type CollName = keyof typeof allColl
const coll_names = Object.keys(allColl) as Array<CollName>

type CollName2Coll<N extends CollName> = typeof allColl[N] extends CollContainer<infer T extends Document>
    ? Collection<T>
    : never

type AllColl = {
    [key in CollName]: CollName2Coll<key>
}

export const collections = {} as AllColl

export async function initMongo() {
    const mongodbConfig = config.mongodb
    if (!mongodbConfig) {
        throw new Error('Get mongodb config error.')
    }
    const mongoClient = await MongoClient.connect(mongodbConfig.url)
    const mongodb = (mongoClient).db(mongodbConfig.name)
    const collectionsFromMongo = (await mongodb.collections())
    await Promise.all(coll_names.map(async name => {
        let collFromMongo = collectionsFromMongo.find(coll => coll.collectionName === name)
        if (!collFromMongo) {
            collFromMongo = await mongodb.createCollection(name)
            await initMongoIndex(name)
        }
        collections[name] = collFromMongo as any
    }))
    return mongoClient
}

async function initMongoIndex(collName: CollName): Promise<void> {
    switch (collName) {
        case 'chat_history':
            await initChatHisIndex()
            return
        default:
            return
    }
}

export async function initChatHisIndex() {
    const res = await (collections.chat_history as any as Collection)
        .createIndex({
            user: 1,
            createTime: -1
        })
    console.log(JSON.stringify(res))
}
