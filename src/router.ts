import Router from 'koa-router'
import { ExtendableContext } from 'koa'
import { feishuService } from './feishu'
import { config } from './config'

const router = new Router()

router.post('/chat', async (ctx: ExtendableContext,) => {
    const req = ctx.request
    const data = (req as any).body
    const { challenge, header, type, token } = data
    if ((token ?? header?.token) !== config.feishu.verificationToken) {
        console.error('Invalid Token', token, header?.token)
        ctx.body = {
            code: 100001,
            msg: 'Invalid Token'
        }
    } else if (type === 'url_verification') {
        ctx.body = { challenge: challenge }
    } else {
        const eventType = data?.header?.event_type
        if (eventType === 'im.message.receive_v1') {
            feishuService.feishuChat(data)
        } else {
            console.log('event_type', eventType, data)
        }
        ctx.body = {
            code: 200,
            msg: 'success'
        }
    }
})

export default router
