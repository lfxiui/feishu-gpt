# 飞书机器人

## 功能说明

- 支持流式输出回答，使用效果更加
- 支持问答历史管理，通过 mongodb 实现

## 怎么跑起来

> 配置都在`./config.ts`中

1. 申请 openai api key

2. 飞书创建机器人，配置以下参数
    ```
    appId: '',
    appSecret: '',
    verificationToken: '',// 飞书 verification token
    applicationName: '',// 飞书应用名
    ```

3. 首先通过 docker 安装 mongodb，配置以下参数

    ```
    url: '',
    name: '' // db name
    ```

4. 如果需要代理，配置 proxy，例如：

    ```
    proxy: {
        host: '127.0.0.1',
        port: 4780,
    }
    ```
