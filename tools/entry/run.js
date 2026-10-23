// === 1. 补浏览器基础环境 ===
const noop = () => {};

global.window = global;
global.navigator = {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    language: "zh-CN",
    languages: ["zh-CN", "zh"],
    deviceMemory: 8,
    hardwareConcurrency: 8
};
global.document = {
    createElement: function (tag) {
        return {
            setAttribute: () => {
            },
            getContext: () => ({}), // 防止 Canvas 指纹检测崩溃
        };
    },
    documentElement: {},
    addEventListener: noop,
    body: {}
};
global.location = {
    href: "https://twitter.com", // 替换为该 SDK 工作的目标网站域名
    host: "twitter.com",
    protocol: "https:"
};
global.screen = {width: 1920, height: 1080};

// === 2. 引入 SDK ===
// 如果 require 进来是一个空对象，说明它只尝试挂载到 window，可以尝试从 global 中获取
// const CastleSDK = require('./castle.umd-DpX19jpb.js');
const CastleSDK = require('../../source/inline/castle.umd.js');
const sdkInstance = CastleSDK.default || CastleSDK || global.Castle;

console.log("SDK 导出对象:", CastleSDK);

async function testSDK() {
    try {
        // 1. 获取 SDK 实例（取决于混淆导出方式，可以都打印看一下）
        const Castle = CastleSDK.default || CastleSDK;

        if (!Castle || typeof Castle.configure !== 'function') {
            throw new Error("未能成功获取到 SDK 实例或 configure 方法");
        }

        // 2. 模拟源码中的配置初始化 (对应源码中的 .configure({ pk: n }))
        // 请替换为你在网页抓包中实际拿到的 responsive_web_castle_public_key 字符串值
        const fakePublicKey = 'pk_AvRa79bHyJSYSQHnRpcVtzyxetSvFerx';

        console.log("正在初始化 SDK...");
        Castle.configure({
            pk: fakePublicKey
        });
        console.log("SDK 初始化成功！");

        // 3. 调用你需要的核心创建方法（如 createRequestToken）
        // 注意：有些 SDK 的方法是异步的，可能需要 await，如果不是，去掉 await 即可
        if (typeof Castle.createRequestToken === 'function') {
            console.log("正在生成 Request Token...");
            const token = await Castle.createRequestToken({
                // 这里传入该方法需要的参数，通常是请求的 url、method 或者表单数据
                // 如果不知道传什么，先传空对象 {} 观察报错
            });
            console.log("🎉 成功生成 Token:", token);
        } else {
            console.log("未在导出的对象上找到 createRequestToken 方法，当前导出的键有:", Object.keys(Castle));
        }

    } catch (error) {
        console.error("❌ 运行出错:", error);
    }
}

testSDK();