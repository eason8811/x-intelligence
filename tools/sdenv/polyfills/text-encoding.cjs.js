'use strict';

const {
    TextEncoder,
    TextDecoder
} = require('node:util');

function installTextEncoding(window) {
    for (const [name, constructor] of Object.entries({
        TextEncoder,
        TextDecoder
    })) {
        if (typeof window[name] === 'function') {
            continue;
        }

        Object.defineProperty(window, name, {
            value: constructor,
            writable: true,
            enumerable: false,
            configurable: true
        });
    }
}

module.exports = {installTextEncoding};