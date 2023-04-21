import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import router from './router'
import { initMongo } from './mongo'

(async () => {
    const mongoClient = await initMongo()
    const server = new Koa()
        .use(async (context, next) => {
            const startTime = Date.now()
            const { method, url } = context
            const result = await next()
            console.log({
                title: `${method}  ${url}（${Date.now() - startTime} ms）`,
            })
            return result
        })
        .use((ctx, next) => {
            ctx.response.res.setHeader('Access-Control-Allow-Origin', '*')
            if (ctx.method === 'OPTIONS') {
                ctx.response.res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Origin,origin,Content-Type,Accept,Authorization')
                ctx.response.res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
                ctx.response.body = ''
            }
            return next()
        })
        .use(bodyParser())
        .use(router.routes())
        .listen(3088, () => {
            console.log({
                title: `feishu-gpt boot successfully!`,
                msg: `on port 3088`,
            })
        })

    async function shutdownGracefully(sig: string, num: number) {
        console.log({
            title: 'Close signal',
            msg: `shutdownGracefully, Terminating by signal ${sig}(${num}).`
        })
        server.close()
    }

    server.on('close', async () => {
        try {
            await Promise.all([
                mongoClient.close(),
            ])
        } catch (e) {
            console.log(e)
        } finally {
            process.exit()
        }
    })

// 优雅终止进程（默认信号）
    process.on('SIGTERM', shutdownGracefully)
// Ctrl+C 中断进程
    process.on('SIGINT', shutdownGracefully)
// Ctrl+D 中断进程
    process.on('SIGQUIT', shutdownGracefully)

})()

process.on('unhandledRejection', (reason) => {
    console.error((reason as any)?.stack)
})

process.on('uncaughtException', (err) => {
    console.error({ title: 'sever error', msg: `uncaughtException!! ${err.name} msg: ${err.message}\n${err.stack}` })
})

process.on('exit', () => {
    console.log('exit')
})
