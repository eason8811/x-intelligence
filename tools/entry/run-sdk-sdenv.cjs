
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { jsdomFromText } = require('sdenv');

const args = process.argv.slice(2);
const sdkFile = args.find(arg => !arg.startsWith('--'));
const bodyVisible = args.includes('--body-visible');

const sdkPath = path.resolve(
  sdkFile || 'source/runtime/castle.deobs.iife.js'
);

const source = fs.readFileSync(sdkPath, 'utf8');

async function main() {
  const dom = jsdomFromText(
    '<!doctype html><html><head></head><body></body></html>',
    {
      url: 'https://example.test/',
      contentType: 'text/html',
      runScripts: 'outside-only'
    }
  );

  const context = dom.getInternalVMContext();

  try {
    // 可选：允许 document.body 返回真实 DOM 节点
    if (bodyVisible) {
      vm.runInContext(
        'document.renderBodyFlag = true',
        context
      );
    }

    const beforeGlobals = new Set(
      Reflect.ownKeys(dom.window)
    );

    console.log('=== Environment ===');
    console.dir({
      node: process.version,
      sdkPath,
      bodyVisible,
      documentBody: !!dom.window.document.body,
      pluginCount: dom.window.navigator.plugins?.length,
      mimeTypeCount: dom.window.navigator.mimeTypes?.length
    });

    console.log('\n=== Executing SDK ===');

    const result = vm.runInContext(source, context, {
      filename: sdkPath,
      timeout: 15000,
      displayErrors: true
    });

    console.log('Synchronous execution completed');
    console.log('Return type:', typeof result);

    function inspect() {
      return vm.runInContext(`
        (() => {
          function describe(name) {
            const value = globalThis[name];

            return {
              name,
              type: typeof value,
              tag: Object.prototype.toString.call(value),
              keys: value == null
                ? []
                : Reflect.ownKeys(Object(value))
                    .map(String)
                    .slice(0, 40),
              defaultType:
                value == null
                  ? 'undefined'
                  : typeof value.default
            };
          }

          return {
            readyState: document.readyState,
            documentBody: !!document.body,
            globals: [
              describe('CastleBridge'),
              describe('@castleio/castle-js'),
              describe('Castle')
            ]
          };
        })()
      `, context);
    }

    console.log('\n=== Immediate state ===');
    console.dir(inspect(), { depth: 5 });

    const addedGlobals = Reflect.ownKeys(dom.window)
      .filter(key => !beforeGlobals.has(key))
      .map(String);

    console.log('\n=== Added window properties ===');
    console.dir(addedGlobals.slice(0, 100));

    // 观察短时间内的异步状态变化
    await new Promise(resolve => setTimeout(resolve, 250));

    console.log('\n=== State after 250ms ===');
    console.dir(inspect(), { depth: 5 });

  } catch (error) {
    console.error('\n=== SDK ERROR ===');
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
