// pdf.js v5.6.205 用了 Uint8Array.prototype.toHex / Map.prototype.getOrInsertComputed，
// 部分旧版平板浏览器缺失。index.html 的 inline script 已最早注入垫片；这里再做一次
// 幂等兜底。fake worker 运行于主线程，可共享这些原型方法。
if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toHex) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    configurable: true, writable: true,
    value: function () {
      var hex = '0123456789abcdef';
      var s = '';
      for (var i = 0; i < this.length; i++) {
        var b = this[i];
        s += hex[b >>> 4] + hex[b & 15];
      }
      return s;
    }
  });
}
if (typeof Map !== 'undefined' && !Map.prototype.getOrInsertComputed) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    configurable: true, writable: true,
    value: function (key, callback) {
      if (this.has(key)) return this.get(key);
      var value = callback(key, this);
      this.set(key, value);
      return value;
    }
  });
}

import * as pdfjsLib from './pdf.min.v47.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.v47.mjs', import.meta.url).href;
window.__pdfjs = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
