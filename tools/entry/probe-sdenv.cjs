'use strict';

const vm = require('node:vm');
const { jsdomFromText, version } = require('sdenv');

const dom = jsdomFromText(
  '<!doctype html><html><head></head><body></body></html>',
  {
    url: 'https://example.test/',
    referrer: 'https://example.test/',
    contentType: 'text/html',
    runScripts: 'outside-only'
  }
);

try {
  const result = vm.runInContext(`
    (() => {
      const plugins = navigator.plugins;
      const mimeTypes = navigator.mimeTypes;

      return {
        href: location.href,
        userAgent: navigator.userAgent,

        windowTag: Object.prototype.toString.call(window),
        navigatorTag: Object.prototype.toString.call(navigator),

        plugins: {
          tag: Object.prototype.toString.call(plugins),
          constructorName: plugins?.constructor?.name,
          length: plugins?.length,
          first: plugins?.[0] ? {
            name: plugins[0].name,
            filename: plugins[0].filename,
            description: plugins[0].description,
            length: plugins[0].length,
            tag: Object.prototype.toString.call(plugins[0])
          } : null
        },

        mimeTypes: {
          tag: Object.prototype.toString.call(mimeTypes),
          constructorName: mimeTypes?.constructor?.name,
          length: mimeTypes?.length
        },

        document: {
          readyState: document.readyState,
          bodyExists: !!document.body
        }
      };
    })()
  `, dom.getInternalVMContext());

  console.dir({
    sdenvVersion: version,
    sdenvAttached: !!dom.sdenv,
    result
  }, { depth: null });
} finally {
  dom.window.close();
}
