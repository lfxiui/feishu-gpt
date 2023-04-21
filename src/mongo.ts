import { config } from './config'
import { Collection, Document, MongoClient } from 'mongodb'

export interface ChatHistory extends Document {
    user: any
    createTime: number
    send: string
    answer?: string
}

/*方便类型转换的类，没有实际使用*/
class CollContainer<T> {
}

const allColl = {
    chat_history: new CollContainer<ChatHistory>(),
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
        }
        collections[name] = collFromMongo as any
    }))
    return mongoClient
}

export async function initMongoIndex() {
    const res = await (collections.chat_history as any as Collection)
        .createIndex({
            user: 1,
            createTime: -1
        })
    console.log(JSON.stringify(res))
}
