// pdf.js v5.6.205 用了 Uint8Array.prototype.toHex / Map.prototype.getOrInsertComputed，
// 部分旧版平板浏览器缺失。index.html 的 inline script 已最早注入垫片；这里再做一次
// 幂等兜底，作为后续加载/动态 import _worker 的二次保险。
if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toHex) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    configurable: true, writable: true,
    value: function () {
      var s = '';
      for (var i = 0; i < this.length; i++) {
        s += this[i].toString(16).padStart(2, '0');
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

import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
window.__pdfjs = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
