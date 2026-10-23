
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { jsdomFromText } = require('sdenv');

const ROOT = path.resolve(__dirname, '../..');

const SDK_PATH = path.join(
  ROOT,
  'source/runtime/castle.deobs.iife.js'
);

const TEST_URL =
  process.env.SDK_TEST_URL || 'https://example.test/';

// const PUBLIC_KEY = process.env.CASTLE_PUBLISHABLE_KEY;
const PUBLIC_KEY = 'pk_AvRa79bHyJSYSQHnRpcVtzyxetSvFerx';

const TIMEOUT_MS = Number(
  process.env.SDK_TIMEOUT_MS || 15000
);

async function main() {
  if (!PUBLIC_KEY) {
    throw new Error(
      '请设置 CASTLE_PUBLISHABLE_KEY 环境变量'
    );
  }

  if (!fs.existsSync(SDK_PATH)) {
    throw new Error(`SDK 文件不存在：${SDK_PATH}`);
  }

  const source = fs.readFileSync(SDK_PATH, 'utf8');

  console.log('=== 1. 初始化 sdenv ===');

  const dom = jsdomFromText(
    `<!doctype html>
     <html>
       <head></head>
       <body></body>
     </html>`,
    {
      url: TEST_URL,
      contentType: 'text/html',
      runScripts: 'outside-only'
    }
  );

  const { window } = dom;
  const context = dom.getInternalVMContext();

  try {
    // 前面的测试已证明该标志影响 document.body
    // 将其显式启用，避免初始化期间取不到 body。
    vm.runInContext(
      'document.renderBodyFlag = true',
      context
    );

    console.log({
      userAgent: window.navigator.userAgent,
      documentBody: !!window.document.body,
      plugins: window.navigator.plugins?.length,
      mimeTypes: window.navigator.mimeTypes?.length
    });

    console.log('\n=== 2. 加载 Castle SDK ===');

    vm.runInContext(source, context, {
      filename: SDK_PATH,
      timeout: 15000,
      displayErrors: true
    });

    // 仅检查导出对象，不调用 SDK 方法
    const sdkInfo = vm.runInContext(`
      (() => {
        const sdk = globalThis.CastleBridge?.default;

        return {
          exists: !!sdk,
          keys: sdk ? Object.keys(sdk) : [],
          configure: typeof sdk?.configure,
          createRequestToken:
            typeof sdk?.createRequestToken
        };
      })()
    `, context);

    console.log(sdkInfo);

    if (
      sdkInfo.configure !== 'function' ||
      sdkInfo.createRequestToken !== 'function'
    ) {
      throw new Error('SDK 导出接口不完整');
    }

    console.log('\n=== 3. 配置 SDK ===');

    // 将测试密钥放入 VM 环境
    Object.defineProperty(window, '__castleTestKey', {
      value: PUBLIC_KEY,
      configurable: true
    });

    const configured = vm.runInContext(`
      (() => {
        const sdk = CastleBridge.default;

        const instance = sdk.configure({
          pk: globalThis.__castleTestKey
        });

        globalThis.__castleTestInstance = instance;

        return {
          instanceType: typeof instance,
          instanceKeys:
            instance == null ? [] : Object.keys(instance),
          sameInstance: instance === sdk,
          createRequestToken:
            typeof instance?.createRequestToken
        };
      })()
    `, context, { timeout: 15000 });

    console.log(configured);

    if (configured.createRequestToken !== 'function') {
      throw new Error(
        'configure() 未返回可用的 createRequestToken'
      );
    }

    console.log('\n=== 4. 调用 createRequestToken ===');

    // 在同一个浏览器 VM Realm 中调用 SDK 方法
    const resultPromise = vm.runInContext(`
      globalThis.__castleTestInstance.createRequestToken()
    `, context, {
      timeout: 15000,
      displayErrors: true
    });

    // 同时兼容普通返回值与 Promise
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(
          `createRequestToken 超过 ${TIMEOUT_MS}ms 未完成`
        ));
      }, TIMEOUT_MS);
    });

    let result;

    try {
      result = await Promise.race([
        Promise.resolve(resultPromise),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timer);
    }

    console.log('\n=== 5. 执行结果 ===');

    console.log({
      resultType: typeof result,
      resultTag: Object.prototype.toString.call(result),
      stringLength:
        typeof result === 'string'
          ? result.length
          : undefined,
      objectKeys:
        result && typeof result === 'object'
          ? Object.keys(result).slice(0, 30)
          : undefined
    });

    // 显式开启才输出完整结果，避免意外泄漏令牌
    if (process.env.SHOW_TOKEN === '1') {
      console.log('SDK result:', result);
    }

  } catch (error) {
    console.error('\n=== SDK 执行失败 ===');
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    try {
      delete window.__castleTestKey;
      delete window.__castleTestInstance;
    } catch {}

    dom.window.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
