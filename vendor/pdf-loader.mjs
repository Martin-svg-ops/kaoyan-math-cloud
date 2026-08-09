import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
window.__pdfjs = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
