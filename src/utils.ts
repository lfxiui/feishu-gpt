/**
 * 异步节流，第一次和最后一次会被执行
 */
const getThrottlePro = (gapMs: number) => {
    let lastTime = 0
    let timeout: NodeJS.Timeout | undefined
    let waitFun: (() => Promise<void>) | undefined
    let running = false

    function getWaitFun() {
        return waitFun
    }

    function setWaitFun(fun?: () => Promise<void>) {
        waitFun = fun
    }

    async function run(fun?: () => Promise<void>) {
        if (running) {
            setWaitFun(fun)
        } else {
            running = true
            if (fun) {
                waitFun = undefined
                await fun()
            } else if (waitFun) {
                const wf = getWaitFun()
                setWaitFun(undefined)
                await wf?.()
            }
            running = false
            const wf = getWaitFun()
            if (wf) {
                run()
            }
        }
    }

    return (fun: () => Promise<void>) => {
        const now = Date.now()
        const wait = gapMs - (now - lastTime)
        if (timeout) {
            clearTimeout(timeout)
            timeout = undefined
        }
        if (wait > 0) {
            timeout = setTimeout(() => run(fun), wait)
        } else {
            lastTime = now
            run(fun)
        }
    }
}

export const utils = {
    getThrottlePro: getThrottlePro,
}
