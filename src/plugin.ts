import { config } from './config'
import { google } from 'googleapis'
import { GoogleSearchResult } from './mongo'

const googleSearch = async (input: string): Promise<
    Pick<GoogleSearchResult, 'type' | 'result'>
    | undefined
> => {
    try {
        const customSearch = google.customsearch('v1')
        const res = await customSearch.cse.list({
            cx: config.google.searchId,
            key: config.google.apiKey,
            q: input,
            start: 1,
            num: 5,
            hl: 'zh-CN',
            safe: 'active',
            cr: 'countryCN',
            gl: 'cn',
            filter: '1',
        })
        const items = res.data.items
        if (items && items.length) {
            return {
                type: 'Google',
                result: items
            }
        }
        console.log(JSON.stringify(res.data), 'google search fail.')
        return undefined
    } catch (e) {
        console.error(e)
    }
    return undefined
}

export const pluginService = {
    googleSearch: googleSearch,
}
