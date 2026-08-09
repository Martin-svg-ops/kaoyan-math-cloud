import * as pdfjsLib from './pdf.min.mjs?v=44';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs?v=44', import.meta.url).href;
window.__pdfjs = pdfjsLib;
window.dispatchEvent(new CustomEvent('pdfjs-ready'));
