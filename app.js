(function () {
  'use strict';

  // pdf.js v5.6.205 的构建使用了较新的平台方法，
  // 在 worker/老浏览器（如平板 Safari）会抛 "...is not a function"。
  // 这里在主线程补上；fake worker 运行于主线程，可共享此垫片。
  if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toHex) {
    Uint8Array.prototype.toHex = function () {
      var hex = '0123456789abcdef';
      var s = '';
      for (var i = 0; i < this.length; i++) {
        var b = this[i];
        s += hex[b >>> 4] + hex[b & 15];
      }
      return s;
    };
  }
  if (typeof Map !== 'undefined' && !Map.prototype.getOrInsertComputed) {
    Map.prototype.getOrInsertComputed = function (key, callback) {
      if (this.has(key)) return this.get(key);
      var value = callback(key, this);
      this.set(key, value);
      return value;
    };
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const LS_KEY = 'kaoyan-math-v1';
  const TYPE_LABEL = { single: '单选题', multiple: '多选题', fill: '填空题', solve: '解答题' };
  const DEFAULT_SCORE = { single: 5, multiple: 5, fill: 5, solve: 12 };
  const CHAPTER_LIST = [
    '高等数学·函数极限连续',
    '高等数学·一元函数微分学',
    '高等数学·一元函数积分学',
    '高等数学·向量代数与空间解析几何',
    '高等数学·多元函数微分学',
    '高等数学·多元函数积分学',
    '高等数学·无穷级数',
    '高等数学·常微分方程',
    '线性代数·行列式',
    '线性代数·矩阵',
    '线性代数·向量',
    '线性代数·线性方程组',
    '线性代数·特征值与特征向量',
    '线性代数·二次型',
    '概率论·随机事件和概率',
    '概率论·随机变量及其分布',
    '概率论·多维随机变量及其分布',
    '概率论·随机变量的数字特征',
    '概率论·大数定律与中心极限定理',
    '概率论·数理统计的基本概念',
    '概率论·参数估计',
    '概率论·假设检验'
  ];
  // 旧版预置题库用「第X章·标题」命名（高数9章/线代6章/概率8章），这里映射到 23 个考研大纲模块
  const CHAPTER_ALIAS = {
    '第一章·函数、极限、连续': '高等数学·函数极限连续',
    '第二章·一元函数微分学及其应用': '高等数学·一元函数微分学',
    '第三章·一元函数积分学及其应用': '高等数学·一元函数积分学',
    '第四章·空间解析几何': '高等数学·向量代数与空间解析几何',
    '第五章·多元函数微分学及其应用': '高等数学·多元函数微分学',
    '第六章·重积分及其应用': '高等数学·多元函数积分学',
    '第七章·微分方程及其应用': '高等数学·常微分方程',
    '第八章·无穷级数': '高等数学·无穷级数',
    '第九章·曲线积分与曲面积分': '高等数学·多元函数积分学',
    '第十章·行列式': '线性代数·行列式',
    '第十一章·矩阵': '线性代数·矩阵',
    '第十二章·向量': '线性代数·向量',
    '第十三章·线性方程组': '线性代数·线性方程组',
    '第十四章·相似矩阵': '线性代数·特征值与特征向量',
    '第十五章·二次型': '线性代数·二次型',
    '第十六章·随机事件及其概率': '概率论·随机事件和概率',
    '第十七章·随机变量及其分布': '概率论·随机变量及其分布',
    '第十八章·多维随机变量及其分布': '概率论·多维随机变量及其分布',
    '第十九章·随机变量的数字特征': '概率论·随机变量的数字特征',
    '第二十章·大数定律与中心极限定理': '概率论·大数定律与中心极限定理',
    '第二十一章·数理统计的基本概念': '概率论·数理统计的基本概念',
    '第二十二章·参数估计': '概率论·参数估计',
    '第二十三章·假设检验': '概率论·假设检验'
  };
  function normalizeChapter(ch) {
    if (!ch) return ch;
    if (CHAPTER_LIST.indexOf(ch) !== -1) return ch;
    return CHAPTER_ALIAS[ch] || ch;
  }
  const PAGE_SIZE = 20;
  const memStore = {};

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    'book-x': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m14.5 7-5 5"/><path d="m9.5 7 5 5"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    'bookmark-check': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/><path d="m9.5 9.5 2 2 3-3" stroke="#0e9f6e"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>'
  };

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mathTex(text) {
    let t = String(text || '');
    /* ASCII 变量+数字 → 上标：x2→x^{2}（数据里 x2 即 x 平方，x1 几乎不出现）。
       排除：字母前是反斜杠(命令)或字母(避免把命令中间字母误判)。 */
    t = t.replace(/(?<![\\a-zA-Z])([a-zA-Z])([0-9]+)/g, '$1^{$2}');
    t = t.replace(/lim_\{([^}]*)\}/g, '\\lim_{$1}');
    t = t.replace(/∑_\{([^}]*)\}\^\{([^}]*)\}/g, '\\sum_{$1}^{$2}');
    t = t.replace(/∑_\{([^}]*)\}/g, '\\sum_{$1}');
    t = t.split('∭').join('\\iiint ');
    t = t.split('∬').join('\\iint ');
    t = t.split('∮').join('\\oint ');
    t = t.split('∫').join('\\int ');
    t = t.split('→∞').join('\\to \\infty ');
    t = t.split('→').join('\\to ');
    t = t.split('∈').join('\\in ');
    t = t.split('≤').join('\\le ');
    t = t.split('≥').join('\\ge ');
    t = t.split('∞').join('\\infty ');
    t = t.split('×').join('\\times ');
    t = t.split('·').join('\\cdot ');
    t = t.split('′').join("'");
    t = t.split('″').join("''");
    t = t.split('‴').join("'''");
    /* 希腊字母 */
    t = t.split('α').join('\\alpha ');
    t = t.split('β').join('\\beta ');
    t = t.split('γ').join('\\gamma ');
    t = t.split('δ').join('\\delta ');
    t = t.split('ε').join('\\varepsilon ');
    t = t.split('θ').join('\\theta ');
    t = t.split('λ').join('\\lambda ');
    t = t.split('μ').join('\\mu ');
    t = t.split('ν').join('\\nu ');
    t = t.split('ξ').join('\\xi ');
    t = t.split('π').join('\\pi ');
    t = t.split('ρ').join('\\rho ');
    t = t.split('σ').join('\\sigma ');
    t = t.split('τ').join('\\tau ');
    t = t.split('φ').join('\\varphi ');
    t = t.split('ψ').join('\\psi ');
    t = t.split('ω').join('\\omega ');
    t = t.split('Γ').join('\\Gamma ');
    t = t.split('Δ').join('\\Delta ');
    t = t.split('Θ').join('\\Theta ');
    t = t.split('Λ').join('\\Lambda ');
    t = t.split('Σ').join('\\Sigma ');
    t = t.split('Φ').join('\\Phi ');
    t = t.split('Ω').join('\\Omega ');
    /* 常用数学符号 */
    t = t.split('∂').join('\\partial ');
    t = t.split('∇').join('\\nabla ');
    t = t.split('±').join('\\pm ');
    t = t.split('∓').join('\\mp ');
    t = t.split('≠').join('\\ne ');
    t = t.split('≈').join('\\approx ');
    t = t.split('≡').join('\\equiv ');
    t = t.split('∀').join('\\forall ');
    t = t.split('∃').join('\\exists ');
    t = t.split('⊂').join('\\subset ');
    t = t.split('⊃').join('\\supset ');
    t = t.split('⊆').join('\\subseteq ');
    t = t.split('⊇').join('\\supseteq ');
    t = t.split('∩').join('\\cap ');
    t = t.split('∪').join('\\cup ');
    t = t.split('∅').join('\\emptyset ');
    t = t.split('√').join('\\sqrt ');
    t = t.split('∝').join('\\propto ');
    t = t.split('∴').join('\\therefore ');
    t = t.split('∵').join('\\because ');
    t = t.split('⇒').join('\\Rightarrow ');
    t = t.split('⇔').join('\\Leftrightarrow ');
    t = t.split('→').join('\\to ');
    t = t.split('⊥').join('\\perp ');
    t = t.split('∥').join('\\parallel ');
    t = t.split('∠').join('\\angle ');
    t = t.split('°').join('^{\\circ}');
    /* 特殊 Unicode 字符 → LaTeX（KaTeX 无对应字模的补偿映射） */
    t = t.split('ᐟ').join('/');            /* 分数斜杠 ¹ᐟ³ → 1/3 */
    t = t.split('⏜').join('\\frown ');     /* 弧 */
    t = t.split('⏝').join('\\frown ');
    t = t.split('⌀').join('\\varnothing '); /* 直径 */
    t = t.split('㏑').join('\\ln ');        /* 自然对数 */
    t = t.split('㏒').join('\\log ');       /* 常用对数 */
    t = t.split('①').join('1'); t = t.split('②').join('2'); t = t.split('③').join('3'); t = t.split('④').join('4');
    t = t.split('⑤').join('5'); t = t.split('⑥').join('6'); t = t.split('⑦').join('7'); t = t.split('⑧').join('8'); t = t.split('⑨').join('9'); t = t.split('⑩').join('10');
    /* Unicode 上下标数字/字母 → LaTeX；连续上下标合并为一组(如 ¹⁸→^{18}, ₃ₓ₃→_{3x3}, ⁻²ˣ→^{-2x})。
       注意：ⁿ(U+207F)/₋(U+208B)/₊(U+208A) 等“预组合”上下标字符也必须纳入，否则 KaTeX 会把它们当作已带上下标的原子，
       再接普通 ^{}/_{} 就会报 double superscript/subscript。 */
    t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ˣʸᶻᵀⁿ⁻⁺]+/g, function (m) {
      var map = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','ˣ':'x','ʸ':'y','ᶻ':'z','ᵀ':'T','ⁿ':'n','⁻':'-','⁺':'+' };
      var s = ''; for (var i = 0; i < m.length; i++) s += (map[m[i]] || ''); return '^{' + s + '}';
    });
    t = t.replace(/[₀₁₂₃₄₅₆₇₈₉ₓₐᵢⱼₙₘₖᵣ₋₊]+/g, function (m) {
      var map = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','ₓ':'x','ₐ':'a','ᵢ':'i','ⱼ':'j','ₙ':'n','ₘ':'m','ₖ':'k','ᵣ':'r','₋':'-','₊':'+' };
      var s = ''; for (var i = 0; i < m.length; i++) s += (map[m[i]] || ''); return '_{' + s + '}';
    });
    /* 兜底：合并仍相邻的上下标组(如已存在的 a^{n}^{-1} → a^{n-1}、a_{n}_{-} → a_{n-})，彻底消除 double 报错。
       只合并同型相邻(^{X}^{Y} / _{X}_{Y})，混合上下标(^{X}_{Y})KaTeX 本就合法，不处理。 */
    var _subPrev;
    do {
      _subPrev = t;
      t = t.replace(/\^\{([^}]*)\}\^\{([^}]*)\}/g, function (m, a, b) { return '^{' + a + b + '}'; });
      t = t.replace(/\_\{([^}]*)\}\_\{([^}]*)\}/g, function (m, a, b) { return '_{' + a + b + '}'; });
    } while (t !== _subPrev);
    t = t.split('∼').join('\\sim '); t = t.split('∽').join('\\backsim '); t = t.split('≅').join('\\cong ');
    t = t.split('⋮').join('\\vdots '); t = t.split('⋰').join('\\ddots '); t = t.split('⋱').join('\\ddots ');
    t = t.split('÷').join('\\div '); t = t.split('⊕').join('\\oplus '); t = t.split('⊗').join('\\otimes ');
    t = t.split('∏').join('\\prod '); t = t.split('∐').join('\\coprod '); t = t.split('∓').join('\\mp ');
    t = t.split('∉').join('\\notin '); t = t.split('∋').join('\\ni '); t = t.split('⊢').join('\\vdash ');
    t = t.split('η').join('\\eta '); t = t.split('ζ').join('\\zeta '); t = t.split('κ').join('\\kappa '); t = t.split('χ').join('\\chi ');
    t = t.split('ϵ').join('\\epsilon '); t = t.split('ϑ').join('\\vartheta '); t = t.split('ϱ').join('\\varrho '); t = t.split('ϒ').join('\\Upsilon ');
    t = t.split('ℝ').join('\\mathbb{R}'); t = t.split('ℕ').join('\\mathbb{N}'); t = t.split('ℤ').join('\\mathbb{Z}'); t = t.split('ℚ').join('\\mathbb{Q}'); t = t.split('ℂ').join('\\mathbb{C}');
    return t;
  }

  function normalizeMathFunctions(t) {
    /* 将粘连/孤立的函数名规范为 LaTeX 命令；已带反斜杠的命令(如 \lim \int)不受影响。
       例：sinx → \sin x，limx → \lim x，cosx → \cos x。长名放前面避免被短名误截(如 arcsin)。 */
    var FN = ['arccos', 'arcsin', 'arctan', 'sinh', 'cosh', 'tanh',
              'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
              'ln', 'lg', 'log', 'exp', 'det', 'lim', 'max', 'min'];
    var re = new RegExp('(?<![a-zA-Z\\\\])(' + FN.join('|') + ')', 'g');
    return t.replace(re, function (m) { return '\\' + m + ' '; });
  }

  function balanceBraces(t) {
    /* PDF 文本提取常产生不平衡的 { } (如分段函数的 }} {{ 噪声)。
       先合并连续花括号，再删去无法配平的孤立花括号，避免 KaTeX 直接报错。
       对本身配平的内容无影响。 */
    t = t.replace(/\}{2,}/g, '}').replace(/\{{2,}/g, '{');
    var opens = 0, res = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === '{') { opens++; res += ch; }
      else if (ch === '}') { if (opens > 0) { opens--; res += ch; } }
      else { res += ch; }
    }
    if (opens > 0) {
      var out = '', cnt = opens;
      for (var k = res.length - 1; k >= 0; k--) {
        if (res[k] === '{' && cnt > 0) { cnt--; } else { out = res[k] + out; }
      }
      res = out;
    }
    return res;
  }

  function convertToLatex(t) {
    /* 纯文本(无$定界符) → LaTeX。 */
    t = t.replace(/&/g, '\\&');
    t = t.replace(/#/g, '\\#');
    t = t.replace(/</g, '\\lt ');
    t = t.replace(/>/g, '\\gt ');
    t = t.replace(/_{2,}/g, function (m) { return '\\_'.repeat(m.length); });
    t = t.replace(/\^(?![{(0-9a-zA-Z])/g, '\\^');
    t = mathTex(t);
    t = normalizeMathFunctions(t);
    /* 中文与中文标点包进 \text{} */
    t = t.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u2014\u2013\u2018\u2019\u201c\u201d]+)/g, '\\text{$1}');
    return t;
  }

  function mathHTML(text) {
    var t = String(text || '');
    if (!t) return '';
    /* 去除零宽字符 */
    t = t.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    /* 字面 \n → 真换行 */
    t = t.replace(/\\n/g, '\n');
    /* 已含 $ 定界符：直接交给 MathJax 解析（不整体再包 $） */
    if (t.indexOf('$') !== -1) {
      return '<span class="math-svg">' + esc(t) + '</span>';
    }
    /* 配平 PDF 提取产生的不平衡花括号 */
    t = balanceBraces(t);
    var latex = convertToLatex(t);
    return '<span class="math-svg">$' + esc(latex) + '$</span>';
  }

  /* 题目主显示：有原书裁图则用图片（公式 100% 准确），否则回退到公式矢量图 */
  function stemMedia(q, cls) {
    q = q || {};
    if (q.img) {
      return '<img class="' + (cls || 'q-img') + '" src="' + esc(q.img) + '" alt="' +
        esc((q.number || '题目') + ' 原书图片') + '" loading="lazy">';
    }
    return mathHTML(q.stem);
  }

  /* 点击题目缩略图打开放大灯箱 */
  function openImageLightbox(src) {
    var old = document.querySelector('.img-lightbox');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.className = 'img-lightbox';
    box.innerHTML = '<img src="' + esc(src) + '" alt="题目大图">';
    box.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
    document.body.appendChild(box);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList && t.classList.contains('q-img-thumb')) {
      openImageLightbox(t.getAttribute('src'));
    }
  });

  /* ---------- MathJax SVG 排版管线：公式渲染为矢量图（字体无关，永不乱码/显示错位） ---------- */
  var _mjPending = [];
  var _mjBatch = [];
  var _mjScheduled = false;
  function _mjQueue(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.classList.contains('math-svg') && !node.classList.contains('mjx-done')) {
      node.classList.add('mjx-done');
      _mjBatch.push(node);
    } else if (node.querySelectorAll) {
      var found = node.querySelectorAll('.math-svg:not(.mjx-done)');
      for (var i = 0; i < found.length; i++) { found[i].classList.add('mjx-done'); _mjBatch.push(found[i]); }
    }
    if (!_mjScheduled) { _mjScheduled = true; Promise.resolve().then(_mjFlushBatch); }
  }
  function _mjFlushBatch() {
    _mjScheduled = false;
    var batch = _mjBatch; _mjBatch = [];
    if (!batch.length) return;
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise(batch).catch(function () {});
    } else {
      _mjPending = _mjPending.concat(batch);
    }
  }
  window.__mjFlush = function () {
    if (_mjPending.length && window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise(_mjPending).catch(function () {});
      _mjPending = [];
    }
  };
  (function initMathJaxTypeset() {
    var content = document.getElementById('content');
    if (content) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var adds = muts[i].addedNodes;
          for (var j = 0; j < adds.length; j++) _mjQueue(adds[j]);
        }
      }).observe(content, { childList: true, subtree: true });
    }
    var modal = document.getElementById('modal');
    if (modal) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var adds = muts[i].addedNodes;
          for (var j = 0; j < adds.length; j++) _mjQueue(adds[j]);
        }
      }).observe(modal, { childList: true, subtree: true });
    }
  })();

  function typesetMath(el) {
    /* 公式由 MutationObserver + MathJax 异步渲染为 SVG，此处无需处理 */
  }

  function uid(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  function fmtClock(sec) {
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? pad(h) + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function stars(n) {
    const count = Math.min(5, Math.max(1, Number(n) || 1));
    return '★'.repeat(count);
  }

  function qById(id) {
    return state.bank.find((q) => q.id === id);
  }

  function typeBadge(type) {
    const cls = type === 'single' ? 'badge-blue' : type === 'multiple' ? 'badge-orange' : type === 'fill' ? 'badge-green' : 'badge-gray';
    return '<span class="badge ' + cls + '">' + esc(TYPE_LABEL[type] || type) + '</span>';
  }

  function unionChapters() {
    const set = new Set(CHAPTER_LIST);
    state.bank.forEach((q) => {
      if (q.chapter) set.add(q.chapter);
    });
    return Array.from(set);
  }

  function bankNameById(id) {
    const bank = state.banks.find((b) => b.id === id);
    return bank ? bank.name : '总题库';
  }

  function defaultUploadBankName() {
    if (!uploadParsed) return '';
    return String(uploadParsed.name || '').replace(/\.[^.]+$/, '').trim() || '未命名题库';
  }

  function normalizeText(s) {
    return String(s == null ? '' : s).trim().replace(/\s+/g, '').toLowerCase();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function makeDefaultData() {
    const now = new Date().toISOString();
    const bank = [
      { id: 'q1', type: 'single', chapter: '极限与连续', difficulty: 1, stem: 'lim_{x→0} (1-cos x)/x² = ?', options: ['0', '1/2', '1', '2'], answer: 'B', analysis: '1-cos x ~ x²/2，故极限为 1/2。' },
      { id: 'q2', type: 'single', chapter: '一元函数微分学', difficulty: 2, stem: '设 f(x)=x³-3x，则 f 在 [-2,2] 上的最大值是？', options: ['-2', '0', '2', '4'], answer: 'C', analysis: "f'(x)=3x²-3，驻点 x=±1；比较端点与驻点值，最大值为 2。" },
      { id: 'q3', type: 'single', chapter: '一元函数积分学', difficulty: 2, stem: '∫₀¹ x eˣ dx = ?', options: ['1', 'e-1', 'e', '0'], answer: 'A', analysis: '分部积分得 (x-1)eˣ，代入 0 到 1 得 1。' },
      { id: 'q4', type: 'single', chapter: '多元函数微分学', difficulty: 3, stem: 'f(x,y)=x²+y² 在约束 x+y=1 下的最小值为？', options: ['0', '1/2', '1', '2'], answer: 'B', analysis: '代入 y=1-x 得 2x²-2x+1，最小值为 1/2。' },
      { id: 'q5', type: 'single', chapter: '常微分方程', difficulty: 2, stem: "微分方程 y'=y 满足 y(0)=1 的特解为？", options: ['y=e^x', 'y=e^{-x}', 'y=x+1', 'y=cos x'], answer: 'A', analysis: '分离变量得 y=Ce^x，由初值条件 C=1。' },
      { id: 'q6', type: 'single', chapter: '线性代数', difficulty: 1, stem: '行列式 | 1 2; 3 4 | = ?', options: ['-2', '2', '-10', '10'], answer: 'A', analysis: '1×4-2×3=-2。' },
      { id: 'q7', type: 'single', chapter: '线性代数', difficulty: 3, stem: 'n 元齐次线性方程组 Ax=0 有非零解，则下列说法正确的是？', options: ['rank(A)=n', 'rank(A)<n', 'rank(A)>n', 'A 可逆'], answer: 'B', analysis: '齐次方程组有非零解当且仅当系数矩阵的秩小于未知数个数。' },
      { id: 'q8', type: 'single', chapter: '概率论与数理统计', difficulty: 1, stem: '设 X~N(0,1)，则 P(X≤0)=？', options: ['1/4', '1/3', '1/2', '2/3'], answer: 'C', analysis: '标准正态分布关于 0 对称，故概率为 1/2。' },
      { id: 'q9', type: 'multiple', chapter: '线性代数', difficulty: 3, stem: '设 A、B 为 n 阶方阵，下列等式恒成立的有？', options: ['|Aᵀ|=|A|', '|kA|=kⁿ|A|', '|AB|=|A||B|', '|A+B|=|A|+|B|'], answer: 'ABC', analysis: '前三个是行列式基本性质；|A+B| 一般不成立。' },
      { id: 'q10', type: 'multiple', chapter: '概率论与数理统计', difficulty: 3, stem: '设随机变量 X 服从参数为 λ 的泊松分布，则下列正确的是？', options: ['E(X)=λ', 'D(X)=λ', 'P(X=0)=e^{-λ}', 'E(X²)=λ²'], answer: 'ABC', analysis: '泊松分布期望与方差均为 λ；E(X²)=D(X)+[E(X)]²=λ+λ²。' },
      { id: 'q11', type: 'multiple', chapter: '多元函数微分学', difficulty: 4, stem: '设 z=f(x,y) 在点 (x₀,y₀) 可微，则下列结论成立的有？', options: ['偏导数存在', '偏导数连续', '函数连续', '任意方向导数存在'], answer: 'ACD', analysis: '可微 ⇒ 偏导存在、函数连续、方向导数存在；偏导连续是充分条件而非可微的必然结论。' },
      { id: 'q12', type: 'fill', chapter: '极限与连续', difficulty: 1, stem: 'lim_{x→∞}(1+1/x)^x = ______。', options: [], answer: 'e', analysis: '这是第二个重要极限。' },
      { id: 'q13', type: 'fill', chapter: '一元函数积分学', difficulty: 1, stem: '∫₀^π sin x dx = ______。', options: [], answer: '2', analysis: '-cos x 在 0 到 π 上的取值为 2。' },
      { id: 'q14', type: 'fill', chapter: '线性代数', difficulty: 2, stem: '设 A 为 3 阶矩阵，|A|=2，则 |2A| = ______。', options: [], answer: '16', analysis: '|2A|=2³|A|=16。' },
      { id: 'q15', type: 'fill', chapter: '概率论与数理统计', difficulty: 2, stem: 'P(A)=0.6，P(B)=0.5，A、B 相互独立，则 P(A∪B)=______。', options: [], answer: '0.8', analysis: 'P(A∪B)=0.6+0.5-0.6×0.5=0.8。' },
      { id: 'q16', type: 'solve', chapter: '极限与连续', difficulty: 3, stem: '求极限 lim_{x→0}(eˣ-1-x)/x²。', options: [], answer: '1/2', analysis: '由泰勒展开 eˣ=1+x+x²/2+o(x²)，分子主项为 x²/2。' },
      { id: 'q17', type: 'solve', chapter: '线性代数', difficulty: 4, stem: '设 A=[1 2; 2 1]，求 A 的特征值与特征向量。', options: [], answer: '特征值 λ₁=3，对应特征向量 (1,1)；λ₂=-1，对应特征向量 (1,-1)。', analysis: '特征多项式 |λE-A|=(λ-3)(λ+1)。' },
      { id: 'q18', type: 'solve', chapter: '概率论与数理统计', difficulty: 3, stem: '设 X 的概率密度 f(x)=cx²，0≤x≤1，其余为 0。求常数 c 与 E(X)。', options: [], answer: 'c=3；E(X)=3/4。', analysis: '∫₀¹ cx²dx=c/3=1 ⇒ c=3；E(X)=∫₀¹ 3x³dx=3/4。' }
    ];
    const paper = {
      id: 'p_sample',
      title: '考研数学基础自测卷',
      createdAt: now,
      qids: ['q1', 'q2', 'q3', 'q5', 'q7', 'q8', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17', 'q18'],
      scores: {},
      duration: 90
    };
    const sampleBankId = 'bank_sample';
    const chapterById = {
      q1: '高等数学·函数极限连续',
      q2: '高等数学·一元函数微分学',
      q3: '高等数学·一元函数积分学',
      q4: '高等数学·多元函数微分学',
      q5: '高等数学·常微分方程',
      q6: '线性代数·行列式',
      q7: '线性代数·线性方程组',
      q8: '概率论·随机变量及其分布',
      q9: '线性代数·行列式',
      q10: '概率论·随机变量及其分布',
      q11: '高等数学·多元函数微分学',
      q12: '高等数学·函数极限连续',
      q13: '高等数学·一元函数积分学',
      q14: '线性代数·行列式',
      q15: '概率论·随机事件和概率',
      q16: '高等数学·函数极限连续',
      q17: '线性代数·特征值与特征向量',
      q18: '概率论·随机变量及其分布'
    };
    const bankWithIds = bank.map((q) => Object.assign({}, q, {
      bankId: sampleBankId,
      chapter: chapterById[q.id] || q.chapter
    }));
    const banks = [
      { id: 'bank_total', name: '总题库', createdAt: now },
      { id: 'bank_sample', name: '示例题库', createdAt: now }
    ];
    if (typeof window !== 'undefined') {
      PRELOADED_BANK_KEYS.forEach((key) => {
        const pre = window[key];
        if (pre && pre.questions && pre.questions.length) {
          const preBank = pre.bank || { id: 'bank_preloaded', name: '预置题库', createdAt: now };
          if (!banks.some((b) => b.id === preBank.id)) banks.push(preBank);
          pre.questions.forEach((q) => {
            bankWithIds.push(Object.assign({}, q, { bankId: preBank.id }));
          });
        }
      });
    }
    return {
      banks: banks,
      bank: bankWithIds,
      papers: [paper],
      attempts: [],
      wrongBooks: [],
      activeWrongBookId: '',
      composeCount: {}
    };
  }

  function normalizeData(d) {
    const now = new Date().toISOString();
    const banks = Array.isArray(d && d.banks) && d.banks.length
      ? d.banks
      : [
          { id: 'bank_total', name: '总题库', createdAt: now },
          { id: 'bank_sample', name: '示例题库', createdAt: now }
        ];
    const bank = (Array.isArray(d && d.bank) ? d.bank : [])
      .filter((q) => q && q.id && (q.stem || q.img))
      .map((q) => Object.assign({}, q, { bankId: q.bankId || 'bank_total', chapter: normalizeChapter(q.chapter) }));
    // 错题本迁移：旧版 state.wrong (数组) → 新版 state.wrongBooks
    let wrongBooks = Array.isArray(d && d.wrongBooks) ? d.wrongBooks : [];
    if (!wrongBooks.length && Array.isArray(d && d.wrong) && d.wrong.length) {
      const wbId = 'wb_default';
      wrongBooks = [{
        id: wbId,
        name: '默认错题本',
        createdAt: d.wrong[0].lastAt || new Date().toISOString(),
        entries: d.wrong.map(function(w) { return { qid: w.qid, wrongCount: w.wrongCount || 1, lastAt: w.lastAt || '', mastered: !!w.mastered }; })
      }];
    }
    const activeWrongBookId = (typeof d === 'object' && d && d.activeWrongBookId) || (wrongBooks.length ? wrongBooks[0].id : '');
    return {
      banks: banks,
      bank: bank,
      papers: Array.isArray(d && d.papers) ? d.papers : [],
      attempts: Array.isArray(d && d.attempts) ? d.attempts : [],
      wrongBooks: wrongBooks,
      activeWrongBookId: activeWrongBookId,
      composeCount: (d && d.composeCount && typeof d.composeCount === 'object') ? d.composeCount : {}
    };
  }

  const PRELOADED_BANK_KEYS = [
    '__preloadedBank880',
    '__preloadedBankGaoshuJichu',
    '__preloadedBankGaoshuZonghe',
    '__preloadedBankGaoshuTuozhan'
  ];

  function ensurePreloadedBank(data, deletedSet) {
    if (typeof window === 'undefined' || !data) return data;
    PRELOADED_BANK_KEYS.forEach((key) => {
      const pre = window[key];
      if (!pre || !pre.questions || !pre.questions.length) return;
      const preBank = pre.bank || { id: 'bank_preloaded', name: '预置题库' };
      // 如果该预置题库已被标记为删除（云端模式），跳过
      if (deletedSet && deletedSet.has(preBank.id)) return;
      if (!data.banks.some((b) => b.id === preBank.id)) {
        data.banks.push(preBank);
      }
      const ids = new Set(data.bank.map((q) => q.id));
      (pre.questions || []).forEach((q) => {
        if (!ids.has(q.id)) {
          data.bank.push(Object.assign({}, q, { bankId: preBank.id, chapter: normalizeChapter(q.chapter) }));
          ids.add(q.id);
        }
      });
    });
    return data;
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memStore, key) ? memStore[key] : null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      memStore[key] = value;
      return false;
    }
  }

  function loadData() {
    try {
      const raw = storageGet(LS_KEY);
      if (raw) return ensurePreloadedBank(normalizeData(JSON.parse(raw)));
    } catch (e) {
      console.warn('读取本地数据失败，将使用示例数据', e);
    }
    return ensurePreloadedBank(makeDefaultData());
  }

  function saveData() {
    if (auth.active) {
      // 云端模式：题库由后端存储，本地仅保留进度类数据（试卷/练习/错题），避免覆盖服务端数据
      const copy = Object.assign({}, state);
      delete copy.bank; delete copy.banks;
      storageSet(LS_KEY, JSON.stringify(copy));
      return;
    }
    // 图片题库的题目（含 dataURL）存 IndexedDB，这里从 localStorage 副本中剔除，避免超出 5MB 配额
    const copy = Object.assign({}, state);
    if (imgBankIds.size) {
      copy.bank = state.bank.filter((q) => !imgBankIds.has(q.bankId));
    }
    const ok = storageSet(LS_KEY, JSON.stringify(copy));
    if (!ok) toast('当前浏览器不支持本地存储，数据仅在本次打开期间有效');
  }

  /* ===== 用户图片题库持久化（IndexedDB，避免 localStorage 5MB 配额被图片撑爆）===== */
  const USER_BANK_DB = 'kaoyan-user-banks';
  const imgBankIds = new Set(); // 哪些 bankId 的图片存放在 IndexedDB
  let _idb = null;
  function openUserBankDB() {
    return new Promise((resolve, reject) => {
      if (_idb) return resolve(_idb);
      if (!('indexedDB' in window)) return reject(new Error('no-indexeddb'));
      let req;
      try { req = indexedDB.open(USER_BANK_DB, 1); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('banks')) db.createObjectStore('banks', { keyPath: 'id' });
      };
      req.onsuccess = () => { _idb = req.result; resolve(_idb); };
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPutBank(rec) {
    const db = await openUserBankDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('banks', 'readwrite');
      tx.objectStore('banks').put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGetBank(id) {
    const db = await openUserBankDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('banks', 'readonly');
      const r = tx.objectStore('banks').get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbGetAllBanks() {
    const db = await openUserBankDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('banks', 'readonly');
      const r = tx.objectStore('banks').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbDeleteBank(id) {
    const db = await openUserBankDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('banks', 'readwrite');
      tx.objectStore('banks').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  // 启动时把 IndexedDB 中的图片题库合并回内存 state（刷新后不丢）；
  // 云端模式做镜像对齐：清理云端已删除的题/题库，防止跨设备删除后本地复活
  async function loadUserBanksIntoState() {
    try {
      const recs = await idbGetAllBanks();
      if (!recs.length) return;
      const deletedBanks = new Set(state.deletedBankIds || []);
      const cloudByBank = {};
      state.bank.forEach((q) => { (cloudByBank[q.bankId] = cloudByBank[q.bankId] || new Set()).add(q.id); });
      for (const rec of recs) {
        // 云端已软删除该题库：清理本地镜像，不再合并
        if (deletedBanks.has(rec.id)) {
          try { await idbDeleteBank(rec.id); } catch (e) {}
          imgBankIds.delete(rec.id);
          continue;
        }
        imgBankIds.add(rec.id);
        if (!state.banks.some((b) => b.id === rec.id)) {
          state.banks.push({ id: rec.id, name: rec.name, createdAt: rec.createdAt, userBank: true, imgBank: true });
        }
        const cloudIds = cloudByBank[rec.id];
        const ids = new Set(state.bank.map((q) => q.id));
        (rec.questions || []).forEach((q) => { if (!ids.has(q.id)) { state.bank.push(q); ids.add(q.id); } });
        // 镜像对齐：清理本地 IndexedDB 中云端已删除的题（防跨设备删除后本地复活）
        if (cloudIds) {
          const kept = (rec.questions || []).filter((q) => cloudIds.has(q.id));
          if (kept.length !== (rec.questions || []).length) {
            rec.questions = kept;
            if (!kept.length) { try { await idbDeleteBank(rec.id); imgBankIds.delete(rec.id); } catch (e) {} }
            else { try { await idbPutBank(rec); } catch (e) {} }
          }
        }
      }
      render();
    } catch (e) {
      console.warn('读取本地图片题库失败', e);
    }
  }

  let state = loadData();
  loadUserBanksIntoState();
  let view = 'browse';
  let timerHandle = null;
  let toastTimer = null;
  let showUpload = false;
  let uploadParsed = null;
  let aiEnabled = true; // AI 智能识别题目（过滤空白/碎片、自动归类章节）
  let sidebarMode = 'chapter';
  let topTimer = { running: false, seconds: 0, handle: null };

  const bankFilter = { q: '', chapter: 'all', type: 'all', diff: 'all', bank: 'all', page: 0 };
  let bankSelection = {}; // 题库管理页面题目选中状态 { qid: true }

  function parseQids(json) {
    try { return JSON.parse(json); } catch(e) { return []; }
  }
  const browseFilter = { chapter: 'all', type: 'all', q: '', expanded: {}, page: 0, pageSize: 20 };
  const group = {
    title: '',
    duration: '90',
    chapters: new Set(CHAPTER_LIST),
    counts: { single: 10, multiple: 0, fill: 6, solve: 6 },
    scores: { single: 5, multiple: 5, fill: 5, solve: 12 },
    bank: 'all',
    listBank: 'all',
    diff: 'all',
    q: '',
    chapter: 'all',
    type: 'all',
    sel: [],
    excludeComposed: false
  };
  const wrongFilter = { status: 'pending', chapter: 'all', type: 'all' };
  let session = null;

  const NAV = [
    { id: 'browse', label: '刷题', icon: 'library' },
    { id: 'overview', label: '概览', icon: 'dashboard' },
    { id: 'group', label: '智能组卷', icon: 'layers' },
    { id: 'practice', label: '练习', icon: 'play' },
    { id: 'wrong', label: '错题本', icon: 'book-x' },
    { id: 'bank', label: '题库管理', icon: 'clipboard' },
    { id: 'data', label: '数据', icon: 'database' }
  ];

  // ── 错题本辅助函数 ──
  function ensureDefaultWrongBook() {
    if (!state.wrongBooks || !state.wrongBooks.length) {
      state.wrongBooks = [{
        id: 'wb_default',
        name: '默认错题本',
        createdAt: new Date().toISOString(),
        entries: []
      }];
      state.activeWrongBookId = 'wb_default';
    }
    if (!state.activeWrongBookId || !state.wrongBooks.some(function(wb) { return wb.id === state.activeWrongBookId; })) {
      state.activeWrongBookId = state.wrongBooks[0].id;
    }
  }
  function getActiveWrongBook() {
    ensureDefaultWrongBook();
    return state.wrongBooks.find(function(wb) { return wb.id === state.activeWrongBookId; }) || state.wrongBooks[0];
  }
  function wrongEntries() {
    var wb = getActiveWrongBook();
    return (wb && wb.entries) || [];
  }
  function allWrongQids() {
    var s = {};
    (state.wrongBooks || []).forEach(function(wb) {
      (wb.entries || []).forEach(function(e) { s[e.qid] = true; });
    });
    return s;
  }
  function totalPendingWrong() {
    var n = 0;
    (state.wrongBooks || []).forEach(function(wb) {
      (wb.entries || []).forEach(function(e) { if (!e.mastered) n++; });
    });
    return n;
  }

  function renderTabNav() {
    const pending = totalPendingWrong();
    const wrongBadge = $('#wrongBadge');
    if (wrongBadge) {
      if (pending > 0) {
        wrongBadge.textContent = pending;
        wrongBadge.style.display = '';
      } else {
        wrongBadge.style.display = 'none';
      }
    }
    const navEl = $('#tabNav');
    if (!navEl) return;
    const navItems = NAV.slice();
    if (auth.user && auth.user.isAdmin) navItems.push({ id: 'admin', label: '管理后台', icon: 'target' });
    navEl.innerHTML = navItems.map((n) => {
      return '<button class="tab-item ' + (view === n.id ? 'active' : '') + '" data-nav="' + n.id + '" type="button">' + icon(n.icon) + '<span>' + n.label + '</span></button>';
    }).join('');
  }

  function renderChapterNav() {
    const navEl = $('#chapterNav');
    if (!navEl) return;
    if (sidebarMode === 'chapter') {
      const groups = [
        ['高等数学', CHAPTER_LIST.filter((c) => c.startsWith('高等数学'))],
        ['线性代数', CHAPTER_LIST.filter((c) => c.startsWith('线性代数'))],
        ['概率论', CHAPTER_LIST.filter((c) => c.startsWith('概率论'))]
      ];
      let html = '<div class="chap-item ' + (browseFilter.chapter === 'all' ? 'active' : '') + '" data-chap="all" role="button" tabindex="0"><span>全部考点</span><span class="chap-count">' + state.bank.length + '</span></div>';
      groups.forEach(function(g) {
        var groupName = g[0], chapters = g[1];
        html += '<div class="chap-group-title">' + esc(groupName) + '</div>';
        chapters.forEach(function(c) {
          var count = state.bank.filter(function(q) { return q.chapter === c; }).length;
          var shortName = c.replace(/^[^\u00b7]+\u00b7/, '');
          html += '<div class="chap-item ' + (browseFilter.chapter === c ? 'active' : '') + '" data-chap="' + esc(c) + '" role="button" tabindex="0"><span title="' + esc(c) + '">' + esc(shortName) + '</span><span class="chap-count">' + count + '</span></div>';
        });
      });
      navEl.innerHTML = html;
    } else {
      var types = [
        { key: 'single', label: '单选题', color: '#2563eb' },
        { key: 'multiple', label: '多选题', color: '#7c3aed' },
        { key: 'fill', label: '填空题', color: '#0e9f6e' },
        { key: 'solve', label: '解答题', color: '#d97706' }
      ];
      var html2 = '<div class="type-item ' + (browseFilter.type === 'all' ? 'active' : '') + '" data-type-nav="all" role="button" tabindex="0"><span>全部题型</span><span class="chap-count">' + state.bank.length + '</span></div>';
      types.forEach(function(t) {
        var count = state.bank.filter(function(q) { return q.type === t.key; }).length;
        html2 += '<div class="type-item ' + (browseFilter.type === t.key ? 'active' : '') + '" data-type-nav="' + t.key + '" role="button" tabindex="0"><span class="type-dot" style="background:' + t.color + '"></span><span>' + t.label + '</span><span class="chap-count">' + count + '</span></div>';
      });
      navEl.innerHTML = html2;
    }
  }

  function renderTopBar() {
    renderTabNav();
    renderChapterNav();
    renderUserBadge();
    var td = $('#timerDisplay');
    if (td) {
      if (topTimer.running) {
        var m = Math.floor(topTimer.seconds / 60);
        var s = topTimer.seconds % 60;
        td.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      } else {
        td.textContent = '';
      }
    }
  }

  function renderSyllabus(el) {
    const groups = [
      ['高等数学（约 60%）', CHAPTER_LIST.filter((c) => c.startsWith('高等数学'))],
      ['线性代数（约 20%）', CHAPTER_LIST.filter((c) => c.startsWith('线性代数'))],
      ['概率论与数理统计（约 20%）', CHAPTER_LIST.filter((c) => c.startsWith('概率论'))]
    ];
    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">2026 考研数学（一）考试大纲</h1>
          <p class="page-desc">试卷结构、内容比例与章节范围，组卷默认设置已按此校准</p>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">试卷满分</div><div class="kpi-value">150 分</div><div class="kpi-sub">考试时间 180 分钟</div></div>
        <div class="kpi"><div class="kpi-label">选择题</div><div class="kpi-value">10 × 5</div><div class="kpi-sub">共 50 分</div></div>
        <div class="kpi"><div class="kpi-label">填空题</div><div class="kpi-value">6 × 5</div><div class="kpi-sub">共 30 分</div></div>
        <div class="kpi"><div class="kpi-label">解答题</div><div class="kpi-value">6 题</div><div class="kpi-sub">共 70 分，含证明题</div></div>
      </div>
      <div class="section">
        <h2 class="section-title">考试内容与章节</h2>
        ${groups.map(([title, chapters]) => `
          <div class="panel" style="margin-bottom:12px">
            <div class="panel-head"><h3 class="panel-title">${esc(title)}</h3><span class="badge badge-gray">${chapters.length} 章</span></div>
            <div class="panel-body">
              <div class="chapter-chips">${chapters.map((c) => '<span class="chip checked">' + esc(c) + '</span>').join('')}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function render() {
    renderTopBar();
    const content = $('#content');
    if (view === 'browse') renderBrowse(content);
    else if (view === 'overview') renderOverview(content);
    else if (view === 'syllabus') renderSyllabus(content);
    else if (view === 'bank') renderBank(content);
    else if (view === 'group') renderGroup(content);
    else if (view === 'practice') {
      if (session && session.phase === 'exam') renderExam(content);
      else if (session && session.phase === 'result') renderResult(content);
      else renderPapers(content);
    }     else if (view === 'wrong') renderWrong(content);
    else if (view === 'admin') renderAdmin(content);
    else if (view === 'data') renderData(content);
    typesetMath(content);
  }

  function renderBrowse(el) {
    var list = state.bank.filter(function(q) {
      if (browseFilter.chapter !== 'all' && q.chapter !== browseFilter.chapter) return false;
      if (browseFilter.type !== 'all' && q.type !== browseFilter.type) return false;
      if (browseFilter.q) {
        var qStr = (q.stem + ' ' + q.chapter + ' ' + (q.analysis || '')).toLowerCase();
        if (!qStr.includes(browseFilter.q.trim().toLowerCase())) return false;
      }
      return true;
    });

    var chapterLabel = browseFilter.chapter === 'all' ? '全部考点' : browseFilter.chapter.replace(/^[^\u00b7]+\u00b7/, '');
    var typeLabel = browseFilter.type === 'all' ? '全部题型' : TYPE_LABEL[browseFilter.type];
    var singleCount = list.filter(function(q) { return q.type === 'single'; }).length;
    var fillCount = list.filter(function(q) { return q.type === 'fill'; }).length;
    var solveCount = list.filter(function(q) { return q.type === 'solve'; }).length;

    el.innerHTML = '\n      <div class="page-head">\n        <div>\n          <h1 class="page-title">' + esc(chapterLabel) + '</h1>\n          <p class="page-desc">' + esc(typeLabel) + ' \u00b7 共 ' + list.length + ' 题</p>\n        </div>\n        <div class="head-actions">\n          <div class="search-wrap">' + icon('search') + '<input class="input" type="search" placeholder="\u641c\u7d22\u9898\u5e72\u3001\u7ae0\u8282\u6216\u89e3\u6790" data-browse-q value="' + esc(browseFilter.q) + '"></div>\n          <button class="btn' + (browseFilter.type !== 'all' ? '' : '') + '" data-action="browse-type-cycle" type="button">' + icon('layers') + esc(typeLabel) + '</button>\n        </div>\n      </div>\n      <div class="browse-stats">\n        <div class="browse-stat"><div class="browse-stat-label">\u603b\u9898\u6570</div><div class="browse-stat-value">' + list.length + '</div></div>\n        <div class="browse-stat"><div class="browse-stat-label">\u5355\u9009</div><div class="browse-stat-value">' + singleCount + '</div></div>\n        <div class="browse-stat"><div class="browse-stat-label">\u586b\u7a7a</div><div class="browse-stat-value">' + fillCount + '</div></div>\n        <div class="browse-stat"><div class="browse-stat-label">\u89e3\u7b54</div><div class="browse-stat-value">' + solveCount + '</div></div>\n      </div>\n      '; var totalPages = Math.max(1, Math.ceil(list.length / browseFilter.pageSize)); var page = Math.min(browseFilter.page, totalPages - 1); var pageItems = list.slice(page * browseFilter.pageSize, page * browseFilter.pageSize + browseFilter.pageSize); el.innerHTML += (pageItems.length ? pageItems.map(function(q, i) {
      var expanded = !!browseFilter.expanded[q.id];
      var wrongQids = allWrongQids();
      var inWrong = wrongQids[q.id];
      var hasImg = !!q.img;
      var shortStem = hasImg ? '' : mathHTML(q.stem);
      var headStemHTML = hasImg ? '' : '<div class="qcard-stem' + (expanded ? '' : ' collapsed') + '">' + shortStem + '</div>';
      var imgWrap = hasImg ? '<div class="qcard-imgwrap">' + stemMedia(q) + '</div>' : '';
      var optHTML = '';
      if (q.options && q.options.length) {
        var correctLetters = (q.answer || '').toUpperCase().split('').filter(function(c) { return c; });
        optHTML = '<div class="qcard-options">' + q.options.map(function(opt, oi) {
          var letter = String.fromCharCode(65 + oi);
          var isCorrect = correctLetters.indexOf(letter) >= 0;
          var optBody = hasImg ? '' : '<span class="math-render">' + mathHTML(opt) + '</span>';
          return '<div class="qcard-option' + (hasImg ? ' qcard-option-img' : '') + (isCorrect && expanded ? ' correct-opt' : '') + '"><span class="qcard-option-letter">' + letter + '.</span>' + optBody + '</div>';
        }).join('') + '</div>';
      }
      var answerHTML = q.answer ? '<div class="qcard-answer"><span class="qcard-answer-label">\u53c2\u8003\u7b54\u6848</span>' + esc(q.answer) + '</div>' : '';
      var analysisHTML = q.analysis ? '<div class="qcard-analysis"><strong>\u89e3\u6790\uff1a</strong>' + mathHTML(q.analysis) + '</div>' : '';
      return '<div class="qcard' + (expanded ? ' expanded' : '') + '" data-qid="' + esc(q.id) + '">\n        <div class="qcard-head" data-action="toggle-qcard" data-qid="' + esc(q.id) + '">\n          <span class="qcard-num">' + (page * browseFilter.pageSize + i + 1) + '</span>\n          ' + headStemHTML + '\n          <div class="qcard-meta">' + typeBadge(q.type) + '<span class="difficulty">' + stars(q.difficulty) + '</span>' + (inWrong ? '<span class="badge badge-red">\u9519\u9898</span>' : '') + '</div>\n          <span class="qcard-chevron">' + icon('chevron-down') + '</span>\n        </div>\n        ' + imgWrap + '\n        <div class="qcard-body">\n          ' + optHTML + '\n          ' + answerHTML + '\n          ' + analysisHTML + '\n          <div class="qcard-actions">\n            <button class="btn btn-sm ' + (inWrong ? 'btn-danger' : 'btn-primary') + '" data-action="' + (inWrong ? 'remove-wrong' : 'add-wrong') + '" data-qid="' + esc(q.id) + '" type="button">' + (inWrong ? icon('trash', 'icon-sm') + '\u79fb\u9664\u9519\u9898' : icon('bookmark', 'icon-sm') + '\u52a0\u5165\u9519\u9898\u672c') + '</button>\n            <button class="btn btn-sm" data-action="browse-practice" data-qid="' + esc(q.id) + '" type="button">' + icon('play', 'icon-sm') + '\u8ba1\u65f6\u7ec3\u4e60</button>\n          </div>\n        </div>\n      </div>';
    }).join('') : '<div class="empty-state">' + icon('search') + '<div>\u6ca1\u6709\u5339\u914d\u7684\u9898\u76ee</div></div>'); if (totalPages > 1) { el.innerHTML += '<div class="pagination">'; for (var p = 0; p < totalPages; p++) { el.innerHTML += '<button class="page-btn ' + (p === page ? 'active' : '') + '" data-action="browse-page" data-page="' + p + '" type="button">' + (p + 1) + '</button>'; } el.innerHTML += '</div>'; } el.innerHTML += '';
  }

  function renderOverview(el) {
    const pending = totalPendingWrong();
    var allMastered = 0;
    (state.wrongBooks || []).forEach(function(wb) {
      (wb.entries || []).forEach(function(e) { if (e.mastered) allMastered++; });
    });
    const chapters = unionChapters();
    const counts = chapters
      .map((c) => ({ chapter: c, count: state.bank.filter((q) => q.chapter === c).length }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...counts.map((x) => x.count));
    const recent = state.papers.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">学习概览</h1>
          <p class="page-desc">题库、组卷与错题复习的一站式工作台</p>
        </div>
        <div class="head-actions">
          <button class="btn" data-nav="browse" type="button">${icon('library')}开始刷题</button>
          <button class="btn btn-primary" data-action="quick-group" type="button">${icon('layers')}智能组卷</button>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">题库题目</div><div class="kpi-value">${state.bank.length}</div><div class="kpi-sub">按章节与题型管理</div></div>
        <div class="kpi"><div class="kpi-label">题库模块</div><div class="kpi-value">${state.banks.length}</div><div class="kpi-sub">总题库与上传题库</div></div>
        <div class="kpi"><div class="kpi-label">已组试卷</div><div class="kpi-value">${state.papers.length}</div><div class="kpi-sub">共练习 ${state.attempts.length} 次</div></div>
        <div class="kpi"><div class="kpi-label">待攻克错题</div><div class="kpi-value">${pending}</div><div class="kpi-sub">需要重做巩固</div></div>
        <div class="kpi"><div class="kpi-label">已掌握错题</div><div class="kpi-value">${allMastered}</div><div class="kpi-sub">完成复习闭环</div></div>
      </div>
      <div class="section">
        <h2 class="section-title">题库章节分布</h2>
        <div class="panel"><div class="panel-body bar-chart">
          ${counts.length ? counts.map((x) => `
            <div class="bar-row">
              <span class="bar-label" title="${esc(x.chapter)}">${esc(x.chapter)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.round((x.count / maxCount) * 100)}%"></span></span>
              <span class="bar-value">${x.count}</span>
            </div>`).join('') : '<div class="empty-state">题库为空，先上传或添加题目</div>'}
        </div></div>
      </div>
      <div class="section">
        <div class="page-head" style="margin-bottom:10px">
          <h2 class="section-title" style="margin:0">最近试卷</h2>
          <button class="btn btn-sm" data-action="go-practice" type="button">查看全部</button>
        </div>
        <div class="panel"><div class="panel-body" style="padding:6px 16px">
          ${recent.length ? recent.map((p) => {
            const atts = state.attempts.filter((a) => a.paperId === p.id);
            const last = atts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
            return `<button class="recent-item" data-action="start-paper" data-pid="${esc(p.id)}" type="button">
              <span class="recent-info">
                <span class="recent-title">${esc(p.title)}</span>
                <span class="recent-meta">${p.qids.length} 题 · ${last ? '最近 ' + last.score + '/' + last.total + ' 分' : '尚未练习'}</span>
              </span>
              ${icon('play')}
            </button>`;
          }).join('') : '<div class="empty-state">还没有试卷，去智能组卷创建一份</div>'}
        </div></div>
      </div>`;
  }

  function filterBank() {
    const q = bankFilter.q.trim().toLowerCase();
    return state.bank.filter((item) => {
      if (q && !(item.stem + ' ' + item.chapter + ' ' + (item.analysis || '')).toLowerCase().includes(q)) return false;
      if (bankFilter.bank !== 'all' && item.bankId !== bankFilter.bank) return false;
      if (bankFilter.chapter !== 'all' && item.chapter !== bankFilter.chapter) return false;
      if (bankFilter.type !== 'all' && item.type !== bankFilter.type) return false;
      if (bankFilter.diff !== 'all' && Number(item.difficulty) !== Number(bankFilter.diff)) return false;
      return true;
    });
  }

  function renderBank(el) {
    const chapters = unionChapters();
    const typeOptions = Object.keys(TYPE_LABEL).map((t) => '<option value="' + t + '"' + (bankFilter.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('');
    const chapterOptions = chapters.map((c) => '<option value="' + esc(c) + '"' + (bankFilter.chapter === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    const diffOptions = [1, 2, 3, 4, 5].map((d) => '<option value="' + d + '"' + (bankFilter.diff === String(d) ? ' selected' : '') + '>' + stars(d) + '</option>').join('');
    const bankOptions = state.banks.map((b) => '<option value="' + esc(b.id) + '"' + (bankFilter.bank === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
    const bankListHTML = state.banks.map((b) => {
      const count = state.bank.filter((q) => q.bankId === b.id).length;
      return `<tr>
        <td><strong>${esc(b.name)}</strong><div class="text-small">${b.id === 'bank_total' ? '所有题目汇总' : '上传 / 独立题库模块'}</div></td>
        <td class="num">${count} 题</td>
        <td><div class="q-actions">
          <button class="btn btn-sm" data-action="rename-bank" data-bankid="${esc(b.id)}" type="button">${icon('pencil', 'icon-sm')}重命名</button>
          ${b.id !== 'bank_total' ? '<button class="btn btn-sm btn-danger" data-action="delete-bank" data-bankid="' + esc(b.id) + '" type="button">' + icon('trash', 'icon-sm') + '删除</button>' : ''}
        </div></td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">题库管理</h1>
          <p class="page-desc">支持 JSON / CSV / PDF 上传，也可以手动添加题目</p>
        </div>
        <div class="head-actions">
          <button class="btn" data-action="download-template" data-format="json" type="button">${icon('download')}JSON 模板</button>
          <button class="btn" data-action="download-template" data-format="csv" type="button">${icon('download')}CSV 模板</button>
          <button class="btn" data-action="add-question" type="button">${icon('plus')}添加题目</button>
          <button class="btn btn-primary" data-action="toggle-upload" type="button">${icon('upload')}${showUpload ? '收起上传' : '上传题库'}</button>
        </div>
      </div>
      ${showUpload ? uploadZoneHTML() : ''}
      ${uploadParsed ? uploadSummaryHTML() : ''}
      <div class="section" style="margin-top:0">
        <div class="page-head" style="margin-bottom:10px">
          <h2 class="section-title" style="margin:0">题库模块</h2>
          <span class="text-small">上传的题库会成为独立模块，同时计入总题库</span>
        </div>
        <div class="table-wrap"><table class="table" style="min-width:520px">
          <thead><tr><th>题库名称</th><th>题目数</th><th>操作</th></tr></thead>
          <tbody>${bankListHTML}</tbody>
        </table></div>
      </div>
      ${(state.deletedBanks || []).length ? `
      <div class="section" style="margin-top:14px">
        <div class="page-head" style="margin-bottom:10px">
          <h2 class="section-title" style="margin:0">已删除的题库（可恢复）</h2>
          <span class="text-small">软删除：题目仍保存在云端，恢复后立即重新显示</span>
        </div>
        <div class="table-wrap"><table class="table" style="min-width:520px">
          <thead><tr><th>题库名称</th><th>题目数</th><th>操作</th></tr></thead>
          <tbody>${state.deletedBanks.map(function (b) {
            return '<tr><td><strong>' + esc(b.name) + '</strong><div class="text-small">已删除</div></td>' +
              '<td class="num">' + b.count + ' 题</td>' +
              '<td><button class="btn btn-sm btn-primary" data-action="restore-bank" data-bankid="' + esc(b.id) + '" type="button">' + icon('rotate-ccw', 'icon-sm') + '恢复</button></td></tr>';
          }).join('')}</tbody>
        </table></div>
      </div>` : ''}
      <div class="toolbar">
        <div class="search-wrap">${icon('search')}<input class="input" type="search" placeholder="搜索题干、章节或解析" data-bank-q value="${esc(bankFilter.q)}"></div>
        <select class="select" data-bank-bank style="width:170px"><option value="all">全部题库（总题库）</option>${bankOptions}</select>
        <select class="select" data-bank-chapter style="width:160px"><option value="all">全部章节</option>${chapterOptions}</select>
        <select class="select" data-bank-type style="width:130px"><option value="all">全部题型</option>${typeOptions}</select>
        <select class="select" data-bank-diff style="width:130px"><option value="all">全部难度</option>${diffOptions}</select>
      </div>
      <div id="bankList"></div>`;
    // 添加选中操作栏
    var selectedCount = Object.keys(bankSelection).filter(function(k) { return bankSelection[k]; }).length;
    if (selectedCount > 0) {
      var selBar = document.createElement('div');
      selBar.className = 'toolbar';
      selBar.style.cssText = 'margin-top:12px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:10px';
      selBar.innerHTML = '<span style="font-weight:600;color:#60a5fa">已选 ' + selectedCount + ' 题</span>' +
        '<button class="btn btn-primary btn-sm" data-action="add-selected-to-wrong-book" type="button">' + icon('bookmark', 'icon-sm') + '加入错题本</button>' +
        '<button class="btn btn-sm" data-action="clear-bank-selection" type="button">取消选择</button>';
      el.appendChild(selBar);
    }
    renderBankList();
    const zone = $('#uploadZone');
    if (zone) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleBankFile(f);
      });
    }
  }

  function uploadZoneHTML() {
    return `
      <div class="upload-zone" id="uploadZone">
        ${icon('upload')}
        <h3>上传题库文件</h3>
        <p>拖拽文件到此处，或点击选择文件；支持 PDF（自动裁切为题目图片）、JSON、CSV，上传后可自定义题库名称并本机保存</p>
        <div class="upload-meta">
          <button class="btn btn-primary" data-action="pick-bank-file" type="button">选择文件</button>
          <input type="file" id="uploadFile" accept=".json,.csv,.pdf,application/json,text/csv,application/pdf" style="display:none">
        </div>
        <label class="switch-line" style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#cdd6e8">
          <input type="checkbox" id="aiClassifyToggle" ${aiEnabled ? 'checked' : ''}> AI 智能识别题目（过滤空白/碎片，自动归类章节）
        </label>
        <div id="pdfCropStatus" class="hint" style="margin-top:10px;display:none"></div>
        ${location.protocol === 'file:' ? '<div class="hint" style="margin-top:10px">直接打开本页时 PDF 识别能力有限，建议运行 server.py 后通过本地地址使用完整识别。</div>' : ''}
      </div>`;
  }

  function uploadSummaryHTML() {
    const ok = uploadParsed.questions.length;
    const errs = uploadParsed.errors.length;
    const isPdf = /\.pdf$/i.test(uploadParsed.name || '');
    const isImage = !!uploadParsed.isImage;
    return `
      <div class="upload-summary">
        <div class="field" style="margin:0 0 12px">
          <label class="field-label" for="uploadBankName">题库名称</label>
          <input class="input" id="uploadBankName" type="text" value="${esc(uploadParsed.bankName || defaultUploadBankName())}" data-upload-bank-name placeholder="例如：高数题库A">
          <div class="hint" style="margin-top:6px">入库后将成为独立题库模块，同时计入总题库，可在组卷时单独选择。</div>
        </div>
        <div class="panel-head"><h2 class="panel-title">${esc(uploadParsed.name)}</h2>
          <span class="badge ${errs ? 'badge-orange' : 'badge-green'}">有效 ${ok} 题${errs ? ' · 跳过 ' + errs + ' 条' : ''}</span>
        </div>
        <div class="upload-summary-body">
          ${isImage ? '<div class="hint" style="margin-top:0">PDF 已自动裁切为题目图片，并按考研大纲自动归类到对应模块（章节可在入库后用题库管理的题目编辑调整）。</div>' : ''}
          ${isPdf ? '<div class="hint" style="margin-top:0">PDF 已自动提取文字并识别题目，入库前请核对题型、选项和答案。</div>' : ''}
          ${uploadParsed.questions.slice(0, 8).map((q) => `<div class="hint" style="margin-top:0;display:flex;gap:10px;align-items:flex-start"><div style="flex:0 0 110px">${stemMedia(q, 'q-img q-img-thumb')}</div><div style="flex:1">${typeBadge(q.type)} <strong>${esc(q.number || '')}</strong> · ${esc(q.chapter)}</div></div>`).join('')}
          ${uploadParsed.questions.length > 5 ? '<div class="hint">…共 ' + uploadParsed.questions.length + ' 道题</div>' : ''}
          ${isPdf && !uploadParsed.questions.length && uploadParsed.preview ? '<div class="hint" style="max-height:200px;overflow:auto;white-space:pre-wrap">未识别出题目，以下是提取到的文本：\n' + esc(uploadParsed.preview.slice(0, 1600)) + '</div>' : ''}
          ${errs ? '<div class="hint" style="border-color:rgba(220,38,38,.35)">' + uploadParsed.errors.map(esc).join('<br>') + '</div>' : ''}
          <div class="toolbar" style="margin:14px 0 0">
            <button class="btn btn-primary" data-action="merge-bank" data-mode="append" type="button">${icon('plus')}合并入库</button>
            <button class="btn" data-action="merge-bank" data-mode="replace" type="button">替换现有题库</button>
            <button class="btn btn-ghost" data-action="cancel-upload" type="button">取消</button>
          </div>
        </div>
      </div>`;
  }

  function renderBankList() {
    const list = filterBank();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const page = Math.min(bankFilter.page, pages - 1);
    const rows = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const box = $('#bankList');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="panel"><div class="empty-state">' + icon('file') + '<div>没有符合条件的题目</div></div></div>';
      return;
    }
    box.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th style="width:36px"><input type="checkbox" data-action="bank-select-all" title="全选/取消全选"></th><th style="width:42%">题干</th><th>章节</th><th>题型</th><th>难度</th><th style="width:120px">操作</th></tr></thead>
        <tbody>${rows.map((q) => {
          var checked = !!bankSelection[q.id];
          return `
          <tr class="${checked ? 'row-selected' : ''}">
            <td><input type="checkbox" data-action="bank-select-one" data-qid="${esc(q.id)}" ${checked ? 'checked' : ''}></td>
            <td><div class="stem stem-line" title="${esc(q.stem)}">${q.number ? '<span class="badge badge-gray">' + esc(q.number) + '</span> ' : ''}${stemMedia(q, 'q-img q-img-thumb')}</div></td>
            <td><div>${esc(bankNameById(q.bankId))}</div><div class="text-small">${esc(q.chapter)}</div></td>
            <td>${typeBadge(q.type)}</td>
            <td><span class="difficulty">${stars(q.difficulty)}</span></td>
            <td><div class="q-actions">
              <button class="btn btn-sm" data-action="edit-question" data-qid="${esc(q.id)}" type="button">${icon('pencil', 'icon-sm')}编辑</button>
              <button class="btn btn-sm" data-action="add-to-wrong-from-bank" data-qid="${esc(q.id)}" type="button">${icon('bookmark', 'icon-sm')}错题本</button>
              <button class="btn btn-sm btn-danger" data-action="delete-question" data-qid="${esc(q.id)}" type="button">${icon('trash', 'icon-sm')}删除</button>
            </div></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table></div>
      <div class="pagination">
        <button class="page-btn" data-action="page" data-page="${Math.max(0, page - 1)}" ${page === 0 ? 'disabled' : ''} type="button">上一页</button>
        ${Array.from({ length: pages }, (_, i) => '<button class="page-btn ' + (i === page ? 'active' : '') + '" data-action="page" data-page="' + i + '" type="button">' + (i + 1) + '</button>').join('')}
        <button class="page-btn" data-action="page" data-page="${Math.min(pages - 1, page + 1)}" ${page === pages - 1 ? 'disabled' : ''} type="button">下一页</button>
      </div>`;
    typesetMath(box);
  }

  function renderGroup(el) {
    const chapters = unionChapters();
    const typeOptions = Object.keys(TYPE_LABEL).map((t) => '<option value="' + t + '"' + (group.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('');
    const chapterOptions = chapters.map((c) => '<option value="' + esc(c) + '"' + (group.chapter === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    const diffOptions = [
      ['all', '全部难度'],
      ['easy', '基础（1-2 星）'],
      ['mid', '中等（3-4 星）'],
      ['hard', '难题（5 星）']
    ].map(([v, label]) => '<option value="' + v + '"' + (group.diff === v ? ' selected' : '') + '>' + label + '</option>').join('');
    const bankOptions = ['all'].concat(state.banks).map((b) => {
      const id = b === 'all' ? 'all' : b.id;
      const label = b === 'all' ? '全部题库（总题库）' : b.name;
      return '<option value="' + esc(id) + '"' + (group.bank === id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    const listBankOptions = ['all'].concat(state.banks).map((b) => {
      const id = b === 'all' ? 'all' : b.id;
      const label = b === 'all' ? '全部题库（总题库）' : b.name;
      return '<option value="' + esc(id) + '"' + (group.listBank === id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
    const chipHTML = chapters.map((c) => {
      const checked = group.chapters.has(c);
      return '<label class="chip ' + (checked ? 'checked' : '') + '"><input type="checkbox" data-chapter-chip value="' + esc(c) + '" ' + (checked ? 'checked' : '') + '>' + esc(c) + '</label>';
    }).join('');

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">智能组卷</h1>
          <p class="page-desc">按章节、题型和难度抽取题目，自由调整分值与顺序</p>
        </div>
      </div>
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-head">
          <h2 class="panel-title">自动抽题</h2>
          <button class="btn btn-primary" data-action="auto-pick" type="button">${icon('shuffle')}随机抽题</button>
        </div>
        <div class="panel-body">
          <div class="field" style="margin-bottom:12px"><label class="field-label" for="groupBank">题库范围</label>
            <select class="select" id="groupBank" data-group-bank>${bankOptions}</select>
          </div>
          <div class="field"><span class="field-label">目标章节</span>
            <div class="chapter-chips">${chipHTML}</div>
          </div>
          <div class="pick-grid">
            ${['single', 'multiple', 'fill', 'solve'].map((t) => `
              <div class="field"><label class="field-label" for="cnt_${t}">${TYPE_LABEL[t]}数量</label>
                <input class="input" id="cnt_${t}" type="number" min="0" max="60" value="${group.counts[t]}" data-count-input="${t}">
              </div>`).join('')}
          </div>
          <div class="pick-grid">
            ${['single', 'multiple', 'fill', 'solve'].map((t) => `
              <div class="field"><label class="field-label" for="score_${t}">${TYPE_LABEL[t]}分值</label>
                <input class="input" id="score_${t}" type="number" min="1" max="30" value="${group.scores[t]}" data-score-input="${t}">
              </div>`).join('')}
          </div>
          <div class="pick-grid" style="grid-template-columns:1fr 2fr">
            <div class="field"><label class="field-label" for="groupDiff">难度范围</label>
              <select class="select" id="groupDiff" data-group-diff>${diffOptions}</select>
            </div>
            <div class="field"><label class="field-label">说明</label>
              <div class="hint" style="margin:0">从已选章节中按数量随机抽取；已加入试卷的题目不会重复抽取。</div>
            </div>
          </div>
          <div class="field" style="margin-top:12px">
            <label class="checkbox-inline">
              <input type="checkbox" id="excludeComposed" data-exclude-composed ${group.excludeComposed ? 'checked' : ''}>
              排除已组过的题（只抽没组过的）
            </label>
            <div class="hint" style="margin:4px 0 0">勾选后，随机抽题与下方题目列表都会跳过已被组进试卷的题目。</div>
          </div>
        </div>
      </div>
      <div class="split">
        <div class="split-left">
          <div class="toolbar">
            <div class="search-wrap">${icon('search')}<input class="input" type="search" placeholder="搜索题库" data-group-q value="${esc(group.q)}"></div>
            <select class="select" data-group-listbank style="width:180px">${listBankOptions}</select>
            <select class="select" data-group-chapter style="width:160px"><option value="all">全部章节</option>${chapterOptions}</select>
            <select class="select" data-group-type style="width:130px"><option value="all">全部题型</option>${typeOptions}</select>
            <button class="btn btn-primary" data-action="add-selected" type="button">${icon('plus')}加入选中</button>
          </div>
          <div id="groupList"></div>
        </div>
        <div>
          <div class="panel sticky-panel">
            <div class="panel-head"><h2 class="panel-title">试卷清单</h2><span class="badge badge-gray" id="selCount">${group.sel.length} 题</span></div>
            <div class="panel-body">
              <div class="field" style="margin-bottom:12px"><label class="field-label" for="groupTitle">试卷标题</label>
                <input class="input" id="groupTitle" type="text" placeholder="例如：高数基础强化卷" data-group-title value="${esc(group.title)}">
              </div>
              <div class="field" style="margin-bottom:12px"><label class="field-label" for="groupDuration">考试时长</label>
                <select class="select" id="groupDuration" data-group-duration>
                  ${[['0', '不限时'], ['60', '60 分钟'], ['90', '90 分钟'], ['120', '120 分钟'], ['150', '150 分钟']].map(([v, label]) => '<option value="' + v + '"' + (group.duration === v ? ' selected' : '') + '>' + label + '</option>').join('')}
                </select>
              </div>
              <div id="selList">${renderSelList()}</div>
              <div class="sel-total"><span>满分</span><span class="total-score" id="selTotal">${selTotal()} 分</span></div>
              <div class="toolbar" style="margin-top:12px">
                <button class="btn btn-ghost" data-action="clear-sel" type="button">清空</button>
                <button class="btn btn-primary" data-action="save-paper" type="button">${icon('check')}保存试卷</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    renderGroupList();
  }

  function groupFiltered() {
    const q = group.q.trim().toLowerCase();
    return state.bank.filter((item) => {
      if (q && !(item.stem + ' ' + item.chapter).toLowerCase().includes(q)) return false;
      if (group.listBank !== 'all' && item.bankId !== group.listBank) return false;
      if (group.chapter !== 'all' && item.chapter !== group.chapter) return false;
      if (group.type !== 'all' && item.type !== group.type) return false;
      if (group.excludeComposed && (state.composeCount[item.id] || 0) > 0) return false;
      return true;
    });
  }

  function renderGroupList() {
    const box = $('#groupList');
    if (!box) return;
    const list = groupFiltered();
    if (!list.length) {
      box.innerHTML = '<div class="panel"><div class="empty-state">' + icon('search') + '<div>没有匹配的题目</div></div></div>';
      return;
    }
    box.innerHTML = list.map((q) => {
      const inSel = group.sel.some((s) => s.qid === q.id);
      return `
        <div class="q-row">
          <input type="checkbox" class="q-check" data-pick="${esc(q.id)}" ${inSel ? 'checked' : ''} aria-label="选择题目">
          <div class="q-main">
            <div class="stem stem-line">${stemMedia(q, 'q-img q-img-thumb')}</div>
            <div class="q-meta">${typeBadge(q.type)}<span>${esc(q.chapter)}</span>${q.number ? '<span class="badge badge-gray">题号 ' + esc(q.number) + '</span>' : ''}<span class="difficulty">${stars(q.difficulty)}</span>${inSel ? '<span class="badge badge-green">已加入</span>' : ''}${(state.composeCount[q.id] || 0) > 0 ? '<span class="badge badge-purple">已组 ' + (state.composeCount[q.id] || 0) + ' 次</span>' : ''}</div>
          </div>
          <div class="q-actions"><button class="btn btn-sm" data-action="add-one" data-qid="${esc(q.id)}" type="button">${icon('plus', 'icon-sm')}加入</button></div>
        </div>`;
    }).join('');
  }

  function renderSelList() {
    if (!group.sel.length) return '<div class="empty-state" style="padding:22px 8px">还没有题目，先抽题或勾选加入</div>';
    return group.sel.map((s, i) => {
      const q = qById(s.qid);
      if (!q) return '';
      return `
        <div class="sel-item">
          <div class="sel-title"><strong>${i + 1}.</strong> ${q.number ? '<span class="badge badge-gray">' + esc(q.number) + '</span> ' : ''}${stemMedia(q, 'q-img q-img-thumb')}${(state.composeCount[q.id] || 0) > 0 ? '<span class="badge badge-purple">已组 ' + (state.composeCount[q.id] || 0) + ' 次</span>' : ''}</div>
          <div class="sel-controls">
            ${typeBadge(q.type)}
            <input class="input input-sm score-input" type="number" min="1" max="30" value="${s.score}" data-sel-score="${i}" aria-label="第 ${i + 1} 题分值">
            <button class="btn btn-ghost btn-sm" data-action="move-sel" data-index="${i}" data-dir="-1" type="button" title="上移">${icon('arrow-up', 'icon-sm')}</button>
            <button class="btn btn-ghost btn-sm" data-action="move-sel" data-index="${i}" data-dir="1" type="button" title="下移">${icon('arrow-down', 'icon-sm')}</button>
            <button class="btn btn-danger btn-sm" data-action="remove-sel" data-index="${i}" type="button">${icon('x', 'icon-sm')}</button>
          </div>
        </div>`;
    }).join('');
  }

  function selTotal() {
    return group.sel.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
  }

  function renderPapers(el) {
    const papers = state.papers.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">在线练习</h1>
          <p class="page-desc">选择题与填空题自动评分，解答题支持自评并同步错题本</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" data-action="quick-group" type="button">${icon('plus')}新建试卷</button>
        </div>
      </div>
      ${papers.length ? papers.map((p) => {
        const atts = state.attempts.filter((a) => a.paperId === p.id);
        const last = atts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
        return `
          <div class="paper-row">
            <div class="paper-info">
              <div class="paper-title">${esc(p.title)}</div>
              <div class="paper-meta">
                <span>${p.qids.length} 题</span>
                <span>满分 ${paperTotal(p)} 分</span>
                <span>${p.duration ? p.duration + ' 分钟' : '不限时'}</span>
                <span>${atts.length ? '已练 ' + atts.length + ' 次 · 最近 ' + last.score + '/' + last.total + ' 分' : '尚未练习'}</span>
              </div>
            </div>
            <div class="q-actions">
              <button class="btn btn-primary" data-action="start-paper" data-pid="${esc(p.id)}" type="button">${icon('play')}开始练习</button>
              <button class="btn" data-action="export-paper-pdf" data-pid="${esc(p.id)}" type="button">${icon('download')}导出PDF</button>
              <button class="btn btn-danger" data-action="delete-paper" data-pid="${esc(p.id)}" type="button">${icon('trash', 'icon-sm')}</button>
            </div>
          </div>`;
      }).join('') : '<div class="panel"><div class="empty-state">' + icon('file') + '<div>还没有试卷，先去智能组卷创建</div><div style="margin-top:10px"><button class="btn btn-primary" data-action="quick-group" type="button">创建试卷</button></div></div></div>'}
      ${state.attempts.length ? `
        <div class="section">
          <h2 class="section-title">练习记录</h2>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>试卷</th><th>时间</th><th>得分</th><th>错题数</th></tr></thead>
            <tbody>${state.attempts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map((a) => `
              <tr><td>${esc(a.title)}</td><td>${fmtDate(a.date)}</td><td class="num">${a.score} / ${a.total}</td><td class="num">${(a.wrongIds || []).length}</td></tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : ''}`;
  }

  function paperTotal(p) {
    return (p.qids || []).reduce((sum, qid) => {
      const q = qById(qid);
      return sum + (p.scores && p.scores[qid] ? Number(p.scores[qid]) : (q ? DEFAULT_SCORE[q.type] || 4 : 0));
    }, 0);
  }

  function renderExam(el) {
    const s = session;
    const q = qById(s.qids[s.idx]);
    if (!q) {
      toast('试卷中存在无效题目');
      endSession();
      return;
    }
    const score = (s.scores && s.scores[q.id]) || DEFAULT_SCORE[q.type] || 4;
    const answered = hasAnswer(s.answers[q.id], q.type);
    const palette = s.qids.map((qid, i) => {
      const item = qById(qid);
      const cls = i === s.idx ? 'current' : hasAnswer(s.answers[qid], item && item.type) ? 'done' : '';
      return '<button class="palette-btn ' + cls + '" data-action="palette-q" data-index="' + i + '" type="button">' + (i + 1) + '</button>';
    }).join('');

    el.innerHTML = `
      <div class="exam-wrap">
        <div class="exam-head">
          <h1 class="exam-title">${esc(s.title)}</h1>
          ${s.mode === 'wrong' ? '<span class="badge badge-orange">错题重做</span>' : ''}
          ${s.duration ? '<span class="exam-timer" id="examTimer"></span>' : ''}
          <span class="exam-progress">第 ${s.idx + 1} / ${s.qids.length} 题</span>
        </div>
        <div class="q-palette">${palette}</div>
        <div class="question-card">
          <div class="q-head">
            <span class="q-number">${s.idx + 1}.</span>
            ${typeBadge(q.type)}
            <span class="badge badge-gray">${esc(q.chapter)}</span>
            ${q.number ? '<span class="badge badge-gray">题号 ' + esc(q.number) + '</span>' : ''}
            <span class="difficulty">${stars(q.difficulty)}</span>
            <span class="q-score">${score} 分</span>
          </div>
          <div class="q-stem">${stemMedia(q)}</div>
          ${answerControls(q)}
        </div>
        <div class="exam-nav">
          <button class="btn" data-action="prev-q" ${s.idx === 0 ? 'disabled' : ''} type="button">${icon('chevronLeft')}上一题</button>
          <button class="btn btn-primary" data-action="submit-exam" type="button">交卷</button>
          <button class="btn" data-action="next-q" ${s.idx === s.qids.length - 1 ? 'disabled' : ''} type="button">下一题${icon('chevronRight')}</button>
        </div>
      </div>`;
    startTimer();
  }

  function answerControls(q) {
    const ans = session.answers[q.id];
    if (q.type === 'single' || q.type === 'multiple') {
      const multi = q.type === 'multiple';
      return '<div class="option-list">' + q.options.map((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const selected = multi ? (ans || '').includes(letter) : ans === letter;
        const hasImg = !!q.img;
        const optText = hasImg ? '' : `<span>${mathHTML(opt)}</span>`;
        return `<label class="option ${selected ? 'selected' : ''} ${hasImg ? 'option-img' : ''}">
          <input type="${multi ? 'checkbox' : 'radio'}" name="ans_${q.id}" value="${letter}" data-answer-input data-qid="${q.id}" data-kind="${multi ? 'checkbox' : 'radio'}" ${selected ? 'checked' : ''}>
          <span class="option-letter">${letter}</span>${optText}
        </label>`;
      }).join('') + '</div>';
    }
    if (q.type === 'fill') {
      return '<div class="field"><label class="field-label" for="ans_' + q.id + '">填入答案</label><input class="input" id="ans_' + q.id + '" type="text" placeholder="输入答案" value="' + esc(ans || '') + '" data-answer-input data-qid="' + q.id + '" data-kind="text"></div>';
    }
    return '<div class="field"><label class="field-label" for="ans_' + q.id + '">写出解答过程</label><textarea class="textarea" id="ans_' + q.id + '" rows="6" placeholder="输入解答过程" data-answer-input data-qid="' + q.id + '" data-kind="area">' + esc(ans || '') + '</textarea></div>';
  }

  function hasAnswer(ans, type) {
    if (type === 'multiple') return Array.isArray(ans) ? ans.length > 0 : !!(ans || '').length;
    return !!(ans != null && String(ans).trim().length);
  }

  function renderResult(el) {
    const s = session;
    const gradedList = s.qids.map((qid) => s.graded[qid]);
    const correct = gradedList.filter((v) => v === true).length;
    const wrong = gradedList.filter((v) => v === false).length;
    const pending = gradedList.filter((v) => v == null).length;
    const score = s.score || 0;
    const total = s.total || 0;

    el.innerHTML = `
      <div class="exam-wrap">
        <div class="page-head">
          <div><h1 class="page-title">${esc(s.title)} · 练习结果</h1>
            <p class="page-desc">${s.mode === 'wrong' ? '错题重做完成' : '已生成练习记录，错题已同步到错题本'}</p>
          </div>
          <div class="head-actions">
            ${s.mode === 'paper' ? '<button class="btn" data-action="retry-session" type="button">' + icon('refresh') + '重新练习</button>' : ''}
            ${s.mode === 'wrong' && s.graded[s.qids[0]] === true ? '<button class="btn" data-action="master-and-exit" data-qid="' + esc(s.qids[0]) + '" type="button">' + icon('check') + '标为掌握并完成</button>' : ''}
            <button class="btn btn-primary" data-action="exit-session" type="button">完成</button>
          </div>
        </div>
        <div class="result-head">
          <div class="result-stat"><div class="kpi-label">得分</div><div class="kpi-value">${score}<span style="font-size:14px;color:var(--muted)"> / ${total}</span></div></div>
          <div class="result-stat"><div class="kpi-label">正确</div><div class="kpi-value" style="color:var(--green)">${correct}</div></div>
          <div class="result-stat"><div class="kpi-label">错误</div><div class="kpi-value" style="color:var(--red)">${wrong}</div></div>
          <div class="result-stat"><div class="kpi-label">待自评解答题</div><div class="kpi-value" style="color:var(--orange)">${pending}</div></div>
        </div>
        ${pending ? '<div class="hint" style="margin:0 0 14px">解答题需要你对照答案自评：判定正确会累加对应分值，判定错误会加入错题本。</div>' : ''}
        <div id="reviewList">${renderReviewList()}</div>
      </div>`;
  }

  function renderReviewList() {
    const s = session;
    return s.qids.map((qid, i) => {
      const q = qById(qid);
      if (!q) return '';
      const verdict = s.graded[qid];
      const score = (s.scores && s.scores[qid]) || DEFAULT_SCORE[q.type] || 4;
      const badge = verdict === true ? '<span class="badge badge-green">正确</span>'
        : verdict === false ? '<span class="badge badge-red">错误</span>'
          : '<span class="badge badge-orange">待自评</span>';
      const ansBox = verdict === true ? 'review-answer correct' : verdict === false ? 'review-answer wrong' : 'review-answer';
      const userAnswer = formatAnswer(q, s.answers[qid]);
      const correctAnswer = formatAnswer(q, q.answer, true);
      return `
        <div class="review-item">
          <div class="q-head">
            <span class="q-number">${i + 1}.</span>${typeBadge(q.type)}${badge}
            <span class="q-score">${score} 分</span>
          </div>
          <div class="stem">${stemMedia(q)}</div>
          <div class="review-answer ${ansBox}"><strong>你的答案：</strong>${userAnswer}</div>
          <div class="review-answer"><strong>正确答案：</strong>${correctAnswer}</div>
          ${q.analysis ? '<div class="review-answer"><strong>解析：</strong>' + mathHTML(q.analysis) + '</div>' : ''}
          ${verdict == null ? `
            <div class="toolbar" style="margin:12px 0 0">
              <button class="btn btn-primary" data-action="selfcheck" data-qid="${esc(q.id)}" data-correct="true" type="button">${icon('check')}判定正确</button>
              <button class="btn btn-danger" data-action="selfcheck" data-qid="${esc(q.id)}" data-correct="false" type="button">${icon('x')}判定错误</button>
            </div>` : ''}
        </div>`;
    }).join('');
  }

  function formatAnswer(q, ans, isCorrect) {
    const value = isCorrect ? q.answer : ans;
    if (value == null || value === '') return '<span class="text-muted">未作答</span>';
    if (q.type === 'single' || q.type === 'multiple') {
      const letters = String(value).toUpperCase().split('').filter((c) => /[A-Z]/.test(c));
      return letters.map((l) => {
        const idx = l.charCodeAt(0) - 65;
        return l + '. ' + mathHTML(q.options[idx] || '');
      }).join('<br>') || '<span class="text-muted">未作答</span>';
    }
    return esc(String(value));
  }

  function renderWrong(el) {
    ensureDefaultWrongBook();
    var wb = getActiveWrongBook();
    var all = wb.entries || [];
    var pending = all.filter(function(w) { return !w.mastered; });
    var mastered = all.filter(function(w) { return w.mastered; });
    var sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    var recent = all.filter(function(w) { return w.lastAt && new Date(w.lastAt).getTime() >= sevenDaysAgo; }).length;
    var chapters = unionChapters();
    var chapterOptions = chapters.map(function(c) { return '<option value="' + esc(c) + '"' + (wrongFilter.chapter === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    var typeOptions = Object.keys(TYPE_LABEL).map(function(t) { return '<option value="' + t + '"' + (wrongFilter.type === t ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>'; }).join('');
    var statusOptions = [['pending', '待攻克'], ['mastered', '已掌握'], ['all', '全部']]
      .map(function(kv) { return '<option value="' + kv[0] + '"' + (wrongFilter.status === kv[0] ? ' selected' : '') + '>' + kv[1] + '</option>'; }).join('');

    // 错题本选择器 HTML
    var bookSelectorHTML = (state.wrongBooks || []).map(function(bk) {
      return '<button class="tab-item' + (bk.id === state.activeWrongBookId ? ' active' : '') + '" data-action="switch-wrong-book" data-wbid="' + esc(bk.id) + '" type="button">' + esc(bk.name) + '</button>';
    }).join('');

    var list = all.filter(function(w) {
      if (wrongFilter.status === 'pending' && w.mastered) return false;
      if (wrongFilter.status === 'mastered' && !w.mastered) return false;
      var q = qById(w.qid);
      if (!q) return false;
      if (wrongFilter.chapter !== 'all' && q.chapter !== wrongFilter.chapter) return false;
      if (wrongFilter.type !== 'all' && q.type !== wrongFilter.type) return false;
      return true;
    });

    var headHTML = '';
    headHTML += '<div class="page-head">';
    headHTML += '<div><h1 class="page-title">错题本</h1><p class="page-desc">练习中答错的题目自动收录，支持多个错题本分类管理</p></div>';
    headHTML += '<div class="head-actions">';
    headHTML += '<button class="btn btn-primary" data-action="export-wrong-pdf" type="button">' + icon('download') + '导出PDF</button>';
    headHTML += '<button class="btn" data-action="new-wrong-book" type="button">' + icon('plus') + '新建错题本</button>';
    if (state.wrongBooks.length > 1) {
      headHTML += '<button class="btn btn-ghost" data-action="delete-wrong-book" data-wbid="' + esc(wb.id) + '" type="button">' + icon('trash', 'icon-sm') + '删除本册</button>';
    }
    if (wb.name !== '默认错题本') {
      headHTML += '<button class="btn btn-ghost" data-action="rename-wrong-book" data-wbid="' + esc(wb.id) + '" type="button">' + icon('pencil', 'icon-sm') + '重命名</button>';
    }
    headHTML += '</div></div>';

    var bookTabsHTML = '<div class="wrong-book-tabs" style="display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap">' + bookSelectorHTML + '</div>';

    var kpiHTML = '';
    kpiHTML += '<div class="kpi-grid">';
    kpiHTML += '<div class="kpi"><div class="kpi-label">待攻克</div><div class="kpi-value">' + pending.length + '</div><div class="kpi-sub">需要优先复习</div></div>';
    kpiHTML += '<div class="kpi"><div class="kpi-label">已掌握</div><div class="kpi-value">' + mastered.length + '</div><div class="kpi-sub">已完成复习闭环</div></div>';
    kpiHTML += '<div class="kpi"><div class="kpi-label">错题总数</div><div class="kpi-value">' + all.length + '</div><div class="kpi-sub">当前错题本</div></div>';
    kpiHTML += '<div class="kpi"><div class="kpi-label">近 7 天新增</div><div class="kpi-value">' + recent + '</div><div class="kpi-sub">最近一次出错时间</div></div>';
    kpiHTML += '</div>';

    var toolbarHTML = '';
    toolbarHTML += '<div class="toolbar">';
    toolbarHTML += '<select class="select" data-wrong-status style="width:140px">' + statusOptions + '</select>';
    toolbarHTML += '<select class="select" data-wrong-chapter style="width:180px"><option value="all">全部章节</option>' + chapterOptions + '</select>';
    toolbarHTML += '<select class="select" data-wrong-type style="width:130px"><option value="all">全部题型</option>' + typeOptions + '</select>';
    toolbarHTML += '</div>';

    var listHTML = '';
    if (list.length) {
      var rowHTMLArr = [];
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        var q = qById(w.qid);
        var rowHTML = '';
        rowHTML += '<div class="q-row"><div class="q-main">';
        rowHTML += '<div class="stem stem-line">' + stemMedia(q, 'q-img q-img-thumb') + '</div>';
        rowHTML += '<div class="q-meta">' + typeBadge(q.type) + '<span>' + esc(q.chapter) + '</span>';
        if (q.number) { rowHTML += '<span class="badge badge-gray">题号 ' + esc(q.number) + '</span>'; }
        rowHTML += '<span class="difficulty">' + stars(q.difficulty) + '</span>';
        rowHTML += '<span class="badge ' + (w.mastered ? 'badge-green' : 'badge-red') + '">错 ' + w.wrongCount + ' 次</span>';
        rowHTML += '<span>' + fmtDate(w.lastAt) + '</span></div>';
        if (w.mastered) { rowHTML += '<div class="wrong-stat">' + icon('check-circle') + '已标记掌握</div>'; }
        rowHTML += '</div><div class="q-actions">';
        rowHTML += '<button class="btn btn-primary" data-action="redo-wrong" data-qid="' + esc(q.id) + '" type="button">' + icon('refresh') + '重做</button>';
        if (w.mastered) {
          rowHTML += '<button class="btn" data-action="unmaster" data-qid="' + esc(q.id) + '" type="button">恢复待攻克</button>';
        } else {
          rowHTML += '<button class="btn" data-action="mark-master" data-qid="' + esc(q.id) + '" type="button">标为掌握</button>';
        }
        rowHTML += '<button class="btn btn-danger" data-action="remove-wrong" data-qid="' + esc(q.id) + '" type="button">' + icon('trash', 'icon-sm') + '移除</button>';
        rowHTML += '</div></div>';
        rowHTMLArr.push(rowHTML);
      }
      listHTML = rowHTMLArr.join('');
    } else {
      listHTML = '<div class="panel"><div class="empty-state">' + icon('check-circle') + '<div>这个筛选条件下没有错题</div></div></div>';
    }

    el.innerHTML = headHTML + bookTabsHTML + kpiHTML + toolbarHTML + '<div id="wrongList">' + listHTML + '</div>';
  }

  function renderData(el) {
    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">数据备份与恢复</h1>
          <p class="page-desc">题库、试卷、练习记录和错题本都存在浏览器本地，可随时导出备份</p>
        </div>
      </div>
      <div class="data-card">
        <h3>导出全部数据</h3>
        <p>生成一个 JSON 备份文件，包含题库、试卷、练习记录与错题本。</p>
        <button class="btn btn-primary" data-action="export-data" type="button">${icon('download')}导出备份</button>
      </div>
      <div class="data-card">
        <h3>导入备份</h3>
        <p>选择之前导出的 JSON 备份文件，将完整覆盖当前本地数据。</p>
        <button class="btn" data-action="import-data" type="button">${icon('upload')}选择备份文件</button>
        <input type="file" id="importFile" accept=".json,application/json" style="display:none">
      </div>
      <div class="data-card">
        <h3>恢复示例数据</h3>
        <p>将题库、试卷和错题本重置为网站自带的示例内容，适合重新开始体验。</p>
        <button class="btn btn-danger" data-action="reset-data" type="button">${icon('refresh')}恢复示例数据</button>
      </div>`;
  }

  function uploadZoneReset() {
    showUpload = false;
    uploadParsed = null;
  }

  function setUploadStatus(msg) {
    const el = document.getElementById('pdfCropStatus');
    if (!el) return;
    if (msg) { el.textContent = msg; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  }

  // 把裁图降采样后发给 /api/ai-classify（后端做三级文本分类 + 批量 AI）
  async function aiClassifyQuestions(questions) {
    setUploadStatus('AI 正在识别题目…');
    // 并行降采样到 384px（够 AI 判断用，大幅减小体积）
    const payload = await Promise.all(questions.map(async (q) => {
      const small = await downScaleDataUrl(q.img, 384, 0.5);
      return { id: q.id, dataUrl: small, text: q._text || '' };
    }));
    const resp = await fetch((window.API_BASE || '') + '/api/ai-classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: payload })
    });
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    const data = await resp.json();
    const map = {};
    (data.results || []).forEach((r) => { if (r && r.id) map[r.id] = r; });
    return map;
  }

  // 用 canvas 把 dataURL 等比缩放到最大宽度 maxW，返回压缩后的 JPEG dataURL（减小请求体积与成本）
  function downScaleDataUrl(dataUrl, maxW, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        try { c.getContext('2d').drawImage(img, 0, 0, w, h); } catch (e) { resolve(dataUrl); return; }
        try { resolve(c.toDataURL('image/jpeg', quality)); } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function handleBankFile(file) {
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) {
      try {
        const buffer = await file.arrayBuffer();
        setUploadStatus('正在识别并裁切 PDF 题目图片，请稍候（0%）…');
        const u8 = new Uint8Array(buffer);
        const res = await extractPdfImages(u8, (cur, total) => {
          setUploadStatus('正在识别并裁切 PDF 题目图片，请稍候（' + Math.round(cur / total * 100) + '%）…');
        });
        setUploadStatus('');
        if (!res.questions.length) {
          toast('未能从 PDF 中识别出题目，请确认是带题号的排版 PDF');
          return;
        }
        // 读取 AI 开关（若存在）
        const aiToggle = document.getElementById('aiClassifyToggle');
        if (aiToggle) aiEnabled = !!aiToggle.checked;
        // AI 智能识别：过滤空白/碎片、补全题号与章节（失败则降级保留原切图）
        if (aiEnabled && res.questions.length) {
          try {
            setUploadStatus('AI 正在识别题目、过滤空白与碎片…');
            const map = await aiClassifyQuestions(res.questions);
            const kept = [];
            let removed = 0;
            res.questions.forEach((q) => {
              const r = map[q.id];
              if (r && (r.isQuestion === false || r.isBlank)) { removed++; return; }
              if (r) {
                if (!q.number) q.number = r.number || q.number;
              }
              delete q._text; // 清理临时字段
              kept.push(q);
            });
            res.questions = kept;
            setUploadStatus('');
            if (removed) toast('AI 已过滤 ' + removed + ' 张非题目/空白碎片');
          } catch (e) {
            setUploadStatus('');
            console.warn('AI 识别失败，降级保留原切图', e);
            toast('AI 识别暂不可用（' + (e.message || e) + '），已保留原始切图');
            res.questions.forEach((q) => delete q._text);
          }
        } else {
          res.questions.forEach((q) => delete q._text);
        }
        if (!res.questions.length) {
          toast('所有切图均被 AI 判定为非题目/空白，请关闭 AI 识别后重试，或检查 PDF 排版');
          return;
        }
        uploadParsed = { name: file.name, questions: res.questions, errors: res.errors, isImage: true, bankName: '' };
        if (res.autoSplit && res.questions.length) {
          toast('未检测到题号，已按题目间距自动切分为 ' + res.questions.length + ' 题，请检查切分是否准确');
        }
        render();
      } catch (e) {
        setUploadStatus('');
        console.warn('PDF 图片裁切失败', e);
        toast('PDF 图片裁切失败：' + ((e && e.message) || e));
      }
      return;
    }
    let text = '';
    try {
      text = await file.text();
    } catch (e) {
      toast('文件读取失败');
      return;
    }
    let rawList = [];
    let bankName = '';
    try {
      if (/\.json$/i.test(file.name)) {
        const data = JSON.parse(text);
        rawList = Array.isArray(data) ? data : (data.questions || []);
        bankName = String((data && data.name) || (data && data.bankName) || '').trim();
      } else if (/\.csv$/i.test(file.name)) {
        rawList = parseCSV(text);
      } else {
        toast('仅支持 JSON、CSV 或 PDF 文件');
        return;
      }
    } catch (e) {
      toast('文件解析失败，请检查格式');
      return;
    }
    const questions = [];
    const errors = [];
    rawList.forEach((raw, i) => {
      const res = normalizeRawQuestion(raw);
      if (res.error) errors.push(res.error);
      else questions.push(res.q);
    });
    uploadParsed = { name: file.name, questions: questions, errors: errors, bankName: bankName };
    render();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += c;
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        row.push(cur);
        cur = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur);
        cur = '';
        if (row.some((s) => String(s).trim() !== '')) rows.push(row);
        row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) {
      row.push(cur);
      if (row.some((s) => String(s).trim() !== '')) rows.push(row);
    }
    const header = rows[0] || [];
    const idx = { type: header.indexOf('type'), chapter: header.indexOf('chapter'), difficulty: header.indexOf('difficulty'), stem: header.indexOf('stem'), options: header.indexOf('options'), answer: header.indexOf('answer'), analysis: header.indexOf('analysis') };
    return rows.slice(1).map((r) => {
      const get = (k) => (idx[k] >= 0 ? r[idx[k]] : '');
      return { type: get('type'), chapter: get('chapter'), difficulty: get('difficulty'), stem: get('stem'), options: get('options'), answer: get('answer'), analysis: get('analysis') };
    });
  }

  async function inflatePdfBytes(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        let data = bytes;
        while (data.length && (data[data.length - 1] === 10 || data[data.length - 1] === 13)) {
          data = data.slice(0, -1);
        }
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) {
        // fall through to pako
      }
    }
    if (typeof window !== 'undefined' && window.pako && typeof window.pako.inflate === 'function') {
      return new Uint8Array(window.pako.inflate(bytes));
    }
    throw new Error('当前浏览器不支持 PDF 解压');
  }

  function decodePdfString(s) {
    return s
      .replace(/\\([nrtbf()\\])/g, (m, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
      .replace(/\\(\d{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  async function extractPdfViaServer(file) {
    if (typeof location === 'undefined' || location.protocol === 'file:' || typeof FormData === 'undefined' || typeof fetch === 'undefined') {
      return '';
    }
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch((window.API_BASE || '') + '/api/extract-pdf', { method: 'POST', body: fd });
      if (!res.ok) return '';
      const data = await res.json();
      return data && data.text ? data.text : '';
    } catch (e) {
      return '';
    }
  }

  function extractPdfTextOperators(content) {
    const cleaned = content
      .replace(/\bET\b/g, '\n')
      .replace(/\bT\*\b/g, '\n')
      .replace(/\bTd\b|\bTD\b|\bTm\b/g, '\n');
    const out = [];
    cleaned.split('\n').forEach((line) => {
      const re = /\((?:\\.|[^\\()])*\)|\[[^\]]*\]/g;
      const parts = [];
      let m;
      while ((m = re.exec(line)) !== null) {
        const tok = m[0];
        if (tok.startsWith('(')) {
          parts.push(decodePdfString(tok.slice(1, -1)));
        } else {
          const inner = tok.slice(1, -1);
          const re2 = /\((?:\\.|[^\\()])*\)/g;
          let n;
          while ((n = re2.exec(inner)) !== null) parts.push(decodePdfString(n[0].slice(1, -1)));
        }
      }
      if (parts.length) out.push(parts.join(' ').replace(/[ \t]+/g, ' ').trim());
    });
    return out.filter(Boolean).join('\n');
  }

  async function extractPdfTextWithPdfjs(u8) {
    const pdfjs = window.__pdfjs;
    const task = pdfjs.getDocument({ data: u8.slice(0), disableFontFace: true, isEvalSupported: false });
    const doc = await task.promise;
    const pages = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        let text = '';
        textContent.items.forEach((item) => {
          if (item.str) text += item.str + (item.hasEOL ? '\n' : ' ');
        });
        pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
      }
    } finally {
      await doc.destroy();
    }
    return pages.filter(Boolean).join('\n');
  }

  async function extractPdfText(u8) {
    if (typeof window !== 'undefined' && window.__pdfjs) {
      try {
        return await extractPdfTextWithPdfjs(u8);
      } catch (e) {
        console.warn('PDF.js 提取失败，回退到轻量解析', e);
      }
    }
    const source = new TextDecoder('latin1').decode(u8);
    const parts = [];
    const re = /stream\b/g;
    let m;
    while ((m = re.exec(source)) !== null) {
      const before = source.slice(Math.max(0, m.index - 400), m.index);
      const dictOpen = before.lastIndexOf('<<');
      const dictClose = before.lastIndexOf('>>');
      const dict = dictOpen >= 0 && dictClose > dictOpen ? before.slice(dictOpen + 2, dictClose) : before;
      if (/\/Subtype\s*\/Image/.test(dict)) continue;
      const isFlate = /\/Filter\s*(\[)?\s*\/FlateDecode/.test(dict);
      const start = m.index + m[0].length;
      let dataStart = start;
      while (dataStart < source.length && (source[dataStart] === '\r' || source[dataStart] === '\n')) {
        dataStart++;
      }
      const end = source.indexOf('endstream', dataStart);
      if (end < 0) continue;
      let bytes = u8.slice(dataStart, end);
      if (isFlate) {
        try {
          bytes = await inflatePdfBytes(bytes);
        } catch (e) {
          continue;
        }
      }
      const content = new TextDecoder('utf-8').decode(bytes);
      const text = extractPdfTextOperators(content);
      if (text.trim()) parts.push(text);
    }
    return parts.join('\n');
  }

  function detectPdfSection(line) {
    if (/多项选择|不定项选择/.test(line)) return 'multiple';
    if (/单项选择|单选/.test(line)) return 'single';
    if (/填空/.test(line)) return 'fill';
    if (/解答|计算题|证明题|简答/.test(line)) return 'solve';
    if (/选择/.test(line)) return 'single';
    return null;
  }

  /* ===== PDF → 题目图片裁切管线（浏览器内用 pdf.js 完成，效果与离线 Python 管线一致）===== */
  const WATERMARK_KEYS = ['防止', '转卖', '小坏蛋', '免费获取', 'nocode', 'http', '公众号'];
  const CROP_SCALE = 2;      // 渲染缩放
  const CROP_MAXW = 1000;    // 裁切后最大宽度（px），超出等比缩小
  const CROP_PAD = 6;        // 去白边留白

  // 把 pdf.js 的 textContent.items 转成带包围盒的词（PDF 坐标，y 向上）
  function pdfItemsToBoxes(items) {
    const out = [];
    items.forEach((it) => {
      if (!it.str) return;
      const e = it.transform[4];
      const f = it.transform[5];
      const w = it.width || 0;
      const h = Math.abs(it.height || it.transform[3] || 9);
      out.push({ text: it.str, x0: e, x1: e + w, y0: f - 2, y1: f + h });
    });
    // 按阅读顺序（上→下、左→右）排序，便于顺次推断题型
    out.sort((a, b) => (b.y1 - a.y1) || (a.x0 - b.x0));
    return out;
  }

  // 判断某 item 是否处于其所在视觉行的行首（x 最小），用于识别题号
  function isLineStart(boxes, i) {
    const b = boxes[i];
    let minX = b.x0;
    for (let j = 0; j < boxes.length; j++) {
      if (j === i) continue;
      if (Math.abs(boxes[j].y1 - b.y1) < 3) minX = Math.min(minX, boxes[j].x0);
    }
    return b.x0 <= minX + 3;
  }

  // 检测题号：支持 (N) / （N） / N. / N、 / N) / 【例 N】 / 习题N / 第N题 / 罗马数字
  // （pdf.js 常把 "(1)" 拆成多个 item，且整行会被合并成巨型 token，故不能仅靠整词正则）
  function detectMarkers(boxes) {
    const markers = [];
    const used = new Set();
    const ROMAN = { 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8, 'Ⅸ': 9, 'Ⅹ': 10 };
    const push = (num, b, extra) => markers.push(Object.assign({ num, y0: b.y0, y1: b.y1 }, extra || {}));
    // 第一遍：(N) / （N） / 罗马数字题号
    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue;
      const b = boxes[i];
      const isOpen = b.text === '(' || b.text === '（';
      if (!isOpen) continue;
      if (!(b.x0 < 160 || isLineStart(boxes, i))) continue;
      const nxt = boxes[i + 1];
      if (nxt && !used.has(i + 1) && Math.abs(nxt.y1 - b.y1) < 4) {
        const dig = nxt.text.replace(/[）).、]/g, '').trim();
        if (/^\d{1,2}$/.test(dig)) { push(parseInt(dig, 10), b); used.add(i); used.add(i + 1); continue; }
        if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]$/.test(nxt.text.trim())) { push(ROMAN[nxt.text.trim()], b, { roman: true }); used.add(i); used.add(i + 1); continue; }
      }
      const m = /^\((\d{1,2})[）).、]?$/.exec(b.text);
      if (m) { push(parseInt(m[1], 10), b); used.add(i); continue; }
      const mr = /^\(([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\)$/.exec(b.text);
      if (mr) { push(ROMAN[mr[1]], b, { roman: true }); used.add(i); continue; }
    }
    // 第二遍：N. / N、 / N) 行首
    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue;
      const b = boxes[i];
      if (!isLineStart(boxes, i)) continue;
      const t = b.text.trim();
      const m = /^(\d{1,3})[.、)）]$/.exec(t);
      if (m && parseInt(m[1], 10) <= 400) { push(parseInt(m[1], 10), b); used.add(i); continue; }
      if (/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]$/.test(t)) { push(ROMAN[t], b, { roman: true }); used.add(i); continue; }
    }
    // 第三遍：中文题号 例N / 习题N / 第N题（行首、短 token，避免误判"例如"等）
    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue;
      const b = boxes[i];
      if (!isLineStart(boxes, i)) continue;
      const t = b.text.trim();
      if (t.length > 12) continue;
      const m = /^(?:【)?例\s*(\d{1,3})】?$/.exec(t) || /^(?:【)?习题\s*(\d{1,3})】?$/.exec(t) || /^第\s*(\d{1,3})\s*题$/.exec(t);
      if (m) { push(parseInt(m[1], 10), b); used.add(i); continue; }
      if (/^(【)?例$/.test(t)) {
        const nxt = boxes[i + 1];
        if (nxt && !used.has(i + 1) && Math.abs(nxt.y1 - b.y1) < 4 && /^\d{1,3}$/.test(nxt.text.trim())) {
          push(parseInt(nxt.text.trim(), 10), b); used.add(i); used.add(i + 1); continue;
        }
      }
    }
    markers.sort((a, b) => b.y1 - a.y1); // 阅读顺序：上→下
    return markers;
  }

  // 无题号时，按文本行的垂直空白把页面聚合成若干“题目块”。
  // v50 改进：
  //  1) 先识别噪声行（页眉/页脚/页码/图注/上一题解答延续/中间孤立短块），
  //     并入最近的“真实行”，避免零星内容被单独切成一道“空题”；
  //  2) 再对真实行组按垂直间距聚类，块间空白明显才切开；
  //  3) 最终做一次最小质量过滤，丢弃几乎空白的块。
  // 这比“整页兜底当一个题”精确，也比直接在块级去伪更稳定。
  function clusterQuestionBlocks(boxes, pageH) {
    if (!boxes.length) return [];
    // 1) 过滤水印行
    const clean = boxes.filter((b) => !WATERMARK_KEYS.some((k) => b.text.indexOf(k) >= 0));
    if (!clean.length) return [];
    // 2) 聚合成文本行（y 向上坐标系，按 y1 接近度合并同一行）
    const sorted = clean.slice().sort((a, b) => b.y1 - a.y1 || a.x0 - b.x0);
    const rows = [];
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const b = sorted[i];
      const last = cur[cur.length - 1];
      if (Math.abs(b.y1 - last.y1) < 6) cur.push(b);
      else { rows.push(cur); cur = [b]; }
    }
    rows.push(cur);
    const rowInfos = rows.map((r) => {
      let yTop = -Infinity, yBot = Infinity;
      let text = '';
      r.forEach((x) => { if (x.y1 > yTop) yTop = x.y1; if (x.y0 < yBot) yBot = x.y0; text += x.text + ' '; });
      return { yTop: yTop, yBot: yBot, text: text.trim() };
    });
    if (rowInfos.length < 2) return rowInfos;

    // 3) 识别噪声行
    const isNoise = (r) => {
      const t = r.text;
      const cjk = (t.match(/[一-龥]/g) || []).length;
      const cy = (r.yTop + r.yBot) / 2;
      const inTopMargin = cy > pageH * 0.92;   // y 向上，顶部 y 大
      const inBotMargin = cy < pageH * 0.06;   // 底部 y 小
      // 页眉/页脚短标题或页码
      if ((inTopMargin || inBotMargin) && t.length < 40 && cjk < 5) return true;
      if (/^[0-9]+$/.test(t)) return true;
      if (/^第\s*\d+\s*页/.test(t)) return true;
      // 图注/表注
      if (/^(图|表)\s*\d/.test(t) && t.length < 22) return true;
      // 上一题解答的延续（不会是新题开头）
      if (/^(解|答)[：:。．.\s]/.test(t) || /^(解|答)$/.test(t)) return true;
      if (/^(由|故|因|所以|则|当|代入|可得|综上|因此|显然|易知|即|其|该|此|而|且|于是|从而|又|因为|证毕|证[。．.])/.test(t)) return true;
      // 中间孤立短块：无题头信号且几乎无汉字
      const hasQuestionSignal = /^(求|设|证明|证|已知|若|计算|讨论|确定|判断|试|求|设|证明)/.test(t) || /[?？]/.test(t);
      if (t.length < 18 && cjk < 4 && !hasQuestionSignal) return true;
      if (t.length < 32 && cjk < 2 && !hasQuestionSignal) return true;
      return false;
    };
    const noiseFlags = rowInfos.map(isNoise);

    // 4) 每个噪声行归属到最近的非噪声行（优先上一题，避免碎片被误判为新题）
    const attached = new Array(rowInfos.length).fill(-1);
    for (let i = 0; i < rowInfos.length; i++) {
      if (!noiseFlags[i]) continue;
      let prev = -1, next = -1;
      for (let j = i - 1; j >= 0; j--) if (!noiseFlags[j]) { prev = j; break; }
      for (let j = i + 1; j < rowInfos.length; j++) if (!noiseFlags[j]) { next = j; break; }
      if (prev >= 0 && next >= 0) {
        const dPrev = Math.abs(rowInfos[i].yBot - rowInfos[prev].yTop);
        const dNext = Math.abs(rowInfos[next].yBot - rowInfos[i].yTop);
        attached[i] = (dNext < dPrev * 0.6) ? next : prev;
      } else if (prev >= 0) {
        attached[i] = prev;
      } else if (next >= 0) {
        attached[i] = next;
      }
    }

    // 5) 把噪声行合并到对应的真实行组
    const groups = [];
    for (let i = 0; i < rowInfos.length; i++) {
      if (noiseFlags[i]) continue;
      groups.push({ rows: [i], yTop: rowInfos[i].yTop, yBot: rowInfos[i].yBot, text: rowInfos[i].text });
    }
    if (!groups.length) return [];
    const rowToGroup = new Array(rowInfos.length).fill(-1);
    groups.forEach((g, gi) => { rowToGroup[g.rows[0]] = gi; });
    for (let i = 0; i < rowInfos.length; i++) {
      if (!noiseFlags[i] || attached[i] < 0) continue;
      const gi = rowToGroup[attached[i]];
      if (gi < 0) continue;
      const g = groups[gi];
      g.rows.push(i);
      g.yTop = Math.max(g.yTop, rowInfos[i].yTop);
      g.yBot = Math.min(g.yBot, rowInfos[i].yBot);
      if (i < attached[i]) {
        g.text = (rowInfos[i].text + ' ' + g.text).trim();
      } else {
        g.text = (g.text + ' ' + rowInfos[i].text).trim();
      }
    }

    // 6) 按 y 坐标排序（上→下）
    groups.sort((a, b) => b.yTop - a.yTop);

    // 7) 按相邻组之间的垂直空白切分
    const gaps = [];
    for (let i = 1; i < groups.length; i++) gaps.push(groups[i - 1].yBot - groups[i].yTop);
    gaps.sort((a, b) => a - b);
    const minGap = gaps.length ? gaps[0] : 14;
    const baseline = Math.min(minGap, 36);
    const threshold = Math.max(18, baseline * 2.8);
    const blocks = [];
    let block = { yTop: groups[0].yTop, yBot: groups[0].yBot, text: groups[0].text };
    for (let i = 1; i < groups.length; i++) {
      const gap = block.yBot - groups[i].yTop;
      if (gap > threshold) {
        blocks.push(block);
        block = { yTop: groups[i].yTop, yBot: groups[i].yBot, text: groups[i].text };
      } else {
        block.yBot = groups[i].yBot;
        block.text += ' ' + groups[i].text;
      }
    }
    blocks.push(block);

    // 8) 最终过滤：删除几乎空白的块
    return blocks.filter((b) => {
      const t = b.text.trim();
      const cjk = (t.match(/[一-龥]/g) || []).length;
      return t.length > 0 && (cjk >= 2 || t.length >= 10);
    });
  }

  // 按考研数学大纲，将题目文本自动归类到对应模块（关键词加权打分，取最高分模块；无命中回退 PDF导入）
  const CHAPTER_RULES = [
    ['高等数学·函数极限连续', [['极限',1],['lim',2],['连续',1],['间断',2],['渐近线',2],['无穷小',1],['无穷大',1],['等价无穷',2],['洛必达',2],['夹逼',2],['单调有界',2],['定义域',2],['值域',2],['反函数',2],['复合函数',2],['有界',1],['保号',2],['重要极限',2],['左连续',2],['右连续',2],['偶函数',1],['奇函数',1],['周期',1]]],
    ['高等数学·一元函数微分学', [['导数',1],['微分',1],['切线',2],['法线',2],['单调性',2],['极值',1],['最值',2],['凹凸',2],['拐点',2],['驻点',2],['中值定理',2],['罗尔',2],['拉格朗日',2],['柯西',2],['泰勒公式',2],['泰勒展开',2],['曲率',2],['可导',2],['导函数',2],['求导',2],['边际',2],['弹性',2],['由方程',2],['参数方程',2],['速率',2],['ξ',2]]],
    ['高等数学·一元函数积分学', [['不定积分',2],['定积分',2],['反常积分',2],['换元积分',2],['分部积分',2],['积分中值',2],['变限积分',2],['旋转体',2],['弧长',2],['平面图形',2],['牛顿莱布尼茨',2],['可积',2],['积分',1],['d x',1],['dt',1],['原函数',2],['路程',2],['平面区域',2],['立体',1]]],
    ['高等数学·向量代数与空间解析几何', [['数量积',2],['向量积',2],['点积',2],['叉积',2],['法向量',2],['方向向量',2],['平面方程',2],['空间直线',2],['曲面',2],['旋转面',2],['柱面',2],['二次曲面',2],['球面',2],['空间曲线',2],['空间解析',2],['直线',1],['平面',1],['投影',2],['夹角',2],['距离',1]]],
    ['高等数学·多元函数微分学', [['偏导数',2],['全微分',2],['方向导数',2],['梯度',2],['隐函数',2],['条件极值',2],['拉格朗日乘数',2],['链式法则',2],['二元函数',2],['多元函数',2]]],
    ['高等数学·多元函数积分学', [['二重积分',2],['三重积分',2],['曲线积分',2],['曲面积分',2],['格林公式',2],['高斯公式',2],['斯托克斯',2],['散度',2],['旋度',2],['重积分',2],['对坐标',2],['对面积',2]]],
    ['高等数学·无穷级数', [['级数',1],['收敛半径',2],['收敛域',2],['幂级数',2],['和函数',2],['通项',2],['正项级数',2],['交错级数',2],['傅里叶',2],['泰勒级数',2],['阿贝尔',2],['一致收敛',2],['项级数',1],['求和',1]]],
    ['高等数学·常微分方程', [['微分方程',2],['通解',2],['特解',2],['初值',2],['可分离变量',2],['齐次微分',2],['一阶线性',2],['二阶常系数',2],['伯努利',2],['欧拉方程',2],['特征方程',2],['积分因子',2],['差分方程',2]]],
    ['线性代数·行列式', [['行列式',2],['余子式',2],['代数余子式',2],['克莱姆',2],['范德蒙德',2]]],
    ['线性代数·矩阵', [['矩阵',1],['转置',2],['逆矩阵',2],['伴随',2],['初等变换',2],['矩阵的秩',2],['分块矩阵',2],['对角矩阵',2],['对称矩阵',2],['正交矩阵',2],['单位阵',2],['相似',1]]],
    ['线性代数·向量', [['线性表示',2],['线性相关',2],['线性无关',2],['极大无关组',2],['向量组的秩',2],['向量空间',2],['基与维数',2],['向量',1]]],
    ['线性代数·线性方程组', [['线性方程组',2],['齐次方程组',2],['非齐次',2],['解空间',2],['基础解系',2],['通解',2],['克拉默',2],['方程组',1]]],
    ['线性代数·特征值与特征向量', [['特征值',2],['特征向量',2],['相似对角化',2],['特征多项式',2],['正交相似',2]]],
    ['线性代数·二次型', [['二次型',2],['标准形',2],['规范形',2],['正定',2],['负定',2],['合同',2],['惯性定理',2]]],
    ['概率论·随机事件和概率', [['随机事件',2],['样本空间',2],['古典概型',2],['条件概率',2],['独立性',2],['全概率',2],['贝叶斯',2],['加法公式',2],['事件',1],['概率',1]]],
    ['概率论·随机变量及其分布', [['随机变量',2],['分布函数',2],['离散型',2],['连续型',2],['概率密度',2],['二项分布',2],['泊松分布',2],['均匀分布',2],['指数分布',2],['正态分布',2],['分布律',2],['分布列',2]]],
    ['概率论·多维随机变量及其分布', [['联合分布',2],['边缘分布',2],['条件分布',2],['协方差',2],['相关系数',2],['二维',2],['多维',2],['卷积',2]]],
    ['概率论·随机变量的数字特征', [['数学期望',2],['方差',2],['中心矩',2],['数字特征',2],['均值',1]]],
    ['概率论·大数定律与中心极限定理', [['大数定律',2],['切比雪夫',2],['中心极限定理',2],['依概率收敛',2]]],
    ['概率论·数理统计的基本概念', [['统计量',2],['抽样分布',2],['卡方分布',2],['t分布',2],['f分布',2],['自由度',2],['样本均值',2],['样本方差',2],['样本',1]]],
    ['概率论·参数估计', [['矩估计',2],['最大似然',2],['无偏估计',2],['有效估计',2],['一致估计',2],['置信区间',2],['区间估计',2],['参数估计',2],['估计量',2]]],
    ['概率论·假设检验', [['假设检验',2],['显著性水平',2],['原假设',2],['备择假设',2],['拒绝域',2],['两类错误',2],['p值',2]]]
  ];

  function classifyChapterByText(text) {
    if (!text) return 'PDF导入';
    const t = String(text);
    let best = 'PDF导入', bestScore = 0;
    for (let i = 0; i < CHAPTER_RULES.length; i++) {
      const kws = CHAPTER_RULES[i][1];
      let score = 0;
      for (let j = 0; j < kws.length; j++) {
        if (t.indexOf(kws[j][0]) >= 0) score += kws[j][1];
      }
      if (score > bestScore) { bestScore = score; best = CHAPTER_RULES[i][0]; }
    }
    return best;
  }

  // 去除图片四周白边（允许轻微 off-white），返回裁切后的 canvas
  function trimCanvasWhitespace(srcCanvas, pad) {
    pad = pad || CROP_PAD;
    const ctx = srcCanvas.getContext('2d');
    const W = srcCanvas.width, H = srcCanvas.height;
    let data;
    try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { return srcCanvas; }
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (!(data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(srcCanvas, minX, minY, w, h, 0, 0, w, h);
    return out;
  }

  // 主入口：返回 { questions:[{id,bankId,number,type,chapter,difficulty,stem,options,answer,analysis,img}], errors:[] }
  async function extractPdfImages(u8, onProgress) {
    const pdfjs = window.__pdfjs;
    if (!pdfjs) throw new Error('PDF 组件未加载');
    const doc = await pdfjs.getDocument({ data: u8.slice(0), disableFontFace: true, isEvalSupported: false }).promise;
    const questions = [];
    const errors = [];
    let autoSplit = false;
    for (let p = 1; p <= doc.numPages; p++) {
      if (onProgress) onProgress(p, doc.numPages);
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: CROP_SCALE });
      const boxes = pdfItemsToBoxes(tc.items);
      const pageH = vp.height / CROP_SCALE;

      // 推断题型 + 定位题号 + 收集水印横条
      let curType = null;
      const wmBands = [];
      boxes.forEach((b) => {
        const sec = detectPdfSection(b.text);
        if (sec && b.y1 > 30) curType = sec;
        if (WATERMARK_KEYS.some((k) => b.text.indexOf(k) >= 0) && b.text.trim().length <= 24) {
          wmBands.push([b.y0, b.y1]);
        }
      });
      const markers = detectMarkers(boxes).map((m) => ({ num: m.num, y0: m.y0, y1: m.y1, type: curType || 'solve' }));
      markers.sort((a, b) => b.y1 - a.y1); // 阅读顺序：上→下

      // 渲染整页到 canvas
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      // 先把水印横条涂白（在整页 canvas 上）
      wmBands.forEach(([by0, by1]) => {
        const cy0 = Math.floor(vp.height - by1 * CROP_SCALE);
        const cy1 = Math.ceil(vp.height - by0 * CROP_SCALE);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, Math.max(0, cy0), canvas.width, Math.min(canvas.height, cy1) - Math.max(0, cy0));
      });

      // 逐题裁切：满宽裁切（避免横向截断公式/表格/配图），再智能去白边
      const vpad = 3; // 上下各留白（PDF 点），避免题号与上下题文字被贴边裁掉
      const doCrop = (topY, botY, qText, num, type) => {
        const sx = 0, sw = canvas.width; // 满宽，彻底消除横向截断
        let sy = Math.floor((pageH - topY) * CROP_SCALE);
        let sh = Math.max(1, Math.ceil((topY - botY) * CROP_SCALE));
        // 钳制到画布范围内，避免 drawImage 因越界抛 IndexSizeError（floor/ceil 取整可能差 <1px）
        if (sy < 0) { sh += sy; sy = 0; }
        sh = Math.min(sh, canvas.height - sy);
        if (sh <= 0) return null;
        let crop = document.createElement('canvas');
        crop.width = sw; crop.height = sh;
        crop.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        crop = trimCanvasWhitespace(crop); // 全白页返回 null
        if (!crop) return null;
        if (crop.width > CROP_MAXW) {
          const f = CROP_MAXW / crop.width;
          const d2 = document.createElement('canvas');
          d2.width = CROP_MAXW; d2.height = Math.round(crop.height * f);
          d2.getContext('2d').drawImage(crop, 0, 0, d2.width, d2.height);
          crop = d2;
        }
        let dataURL;
        try { dataURL = crop.toDataURL('image/jpeg', 0.85); } catch (e) { dataURL = crop.toDataURL(); }
        return {
          id: uid('q'), bankId: '', number: num,
          type, chapter: classifyChapterByText(qText), difficulty: 3,
          stem: '', options: [], answer: '', analysis: '', img: dataURL,
          _text: qText || ''
        };
      };

      if (markers.length) {
        for (let k = 0; k < markers.length; k++) {
          const mk = markers[k];
          // 首题向上延伸到页面顶（保留章节标题等上方内容）；其余题号上移 vpad
          const topY = (k === 0) ? pageH : Math.min(pageH, mk.y1 + vpad);
          const botY = (k + 1 < markers.length) ? Math.max(0, markers[k + 1].y1 - vpad) : 0;
          let qText = '';
          const nb = (k + 1 < markers.length) ? markers[k + 1].y1 : 0;
          boxes.forEach((b) => {
            if (b.y1 <= mk.y1 + 3 && b.y0 >= nb - 3) {
              if (!WATERMARK_KEYS.some((k2) => b.text.indexOf(k2) >= 0) && b.text.trim()) qText += b.text + ' ';
            }
          });
          const q = doCrop(topY, botY, qText, '(' + mk.num + ')', mk.type);
          if (q) questions.push(q);
        }
      } else {
        // 无题号：先按文本行的垂直空白聚类成“题目块”，再按块裁切；
        // 聚类失败（无文字层/全噪声）才整页兜底，避免把一页多题误当一个题，
        // 也避免顶部标题/中间碎片被单独切成“空题”。
        const blocks = clusterQuestionBlocks(boxes, pageH);
        if (blocks.length >= 1) {
          autoSplit = blocks.length >= 2;
          for (let bi = 0; bi < blocks.length; bi++) {
            const blk = blocks[bi];
            const topY = (bi === 0) ? pageH : Math.min(pageH, blk.yTop + vpad);
            const botY = (bi + 1 < blocks.length) ? Math.max(0, blocks[bi + 1].yTop - vpad) : 0;
            const q = doCrop(topY, botY, blk.text, '(P' + p + '-' + (bi + 1) + ')', curType || 'solve');
            if (q) questions.push(q);
          }
        } else {
          // 整页兜底：无题号且无法聚类 / 图片型 PDF（无文字层）也至少保留整页
          let qText = '';
          boxes.forEach((b) => { if (!WATERMARK_KEYS.some((k2) => b.text.indexOf(k2) >= 0) && b.text.trim()) qText += b.text + ' '; });
          const q = doCrop(pageH, 0, qText, '(P' + p + ')', curType || 'solve');
          if (q) questions.push(q);
        }
      }
      await page.cleanup();
    }
    await doc.destroy();
    return { questions, errors, autoSplit };
  }

  function splitPdfOptionsLine(line) {
    const re = /[A-D][\.、．)）:：]/g;
    const segs = [];
    let last = null;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (last != null) segs.push(line.slice(last, m.index));
      last = m.index;
    }
    if (last != null) segs.push(line.slice(last));
    return segs.length >= 2 ? segs : [];
  }

  function cleanPdfText(text) {
    const cleaned = String(text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (/^={3,}/.test(l)) return false;
        if (/^公众号[:：]?/.test(l)) return false;
        if (/^https?:\/\//.test(l)) return false;
        if (/^·\s*第\s*\d+\s*页/.test(l)) return false;
        if (/^第\s*\d+\s*页，共/.test(l)) return false;
        if (/这是一条为了防止/.test(l)) return false;
        return true;
      })
      .join('\n');
    return cleanMathGlyphs(cleaned);
  }

  function cleanMathGlyphs(text) {
    let t = String(text || '');
    const sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
    t = t.replace(/\uf001+/g, '');
    t = t.split('\uf0f4').join('|');
    t = t.split('\uf0eb').join('{');
    t = t.split('\uf0ec').join('}');
    t = t.split('\uf0e0').join('{');
    t = t.split('\uf0e2').join('}');
    t = t.split('\uf0e1').join('|');
    t = t.split('\uf0e3').join('|');
    t = t.split('\uf00a').join('′');
    t = t.split('\uf00b').join('″');
    t = t.split('\uf00c').join('‴');
    t = t.split('\uf0b1').join('∑');
    t = t.split('\uf0b6').join('∫');
    t = t.split('\uf0b7').join('∬');
    t = t.split('\uf0b8').join('∭');
    t = t.split('\uf0b9').join('∮');
    t = t.split('\uf0ba').join('∬');
    t = t.split('\uf0e8').join('[');
    t = t.split('\uf0e9').join(']');
    t = t.split('\uf0ea').join(';');
    t = t.replace(/\uf0e4(?=∣)/g, '{');
    t = t.replace(/\uf0e4/g, '}');
    t = t.split('\uf0ed').join(' ');
    t = t.split('\uf092').join('');
    t = t.split('\uf0dc').join('');
    t = t.split('\uf026').join(' ');
    t = t.replace(/\uf0ee(?=\S)/g, '(');
    t = t.replace(/\uf0ee/g, ')');
    t = t.replace(/\uf0f6(?=\S)/g, '(');
    t = t.replace(/\uf0f6/g, ')');
    t = t.replace(/\uf0cb(?=\S)/g, '[');
    t = t.replace(/\uf0cb/g, ']');
    t = t.replace(/\s+\)/g, ')');
    t = t.replace(/\s+}/g, '}');
    t = t.replace(/\s+\]/g, ']');
    t = t.replace(/([A-Za-z])([0-9])/g, (m, c, d) => c + (sup[d] || d));
    return t;
  }

  function parsePdfText(text) {
    const lines = cleanPdfText(text)
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const questions = [];
    const errors = [];
    let sectionType = null;
    let current = null;
    let inAnalysis = false;
    let currentChapter = '未分类';
    const chapterAlias = {
      '函数、极限、连续': '高等数学·函数极限连续',
      '一元函数微分学': '高等数学·一元函数微分学',
      '一元函数积分学': '高等数学·一元函数积分学',
      '向量代数和空间解析几何': '高等数学·向量代数与空间解析几何',
      '多元函数微分学': '高等数学·多元函数微分学',
      '多元函数积分学': '高等数学·多元函数积分学',
      '无穷级数': '高等数学·无穷级数',
      '常微分方程': '高等数学·常微分方程',
      '行列式': '线性代数·行列式',
      '矩阵': '线性代数·矩阵',
      '向量': '线性代数·向量',
      '线性方程组': '线性代数·线性方程组',
      '矩阵的特征值和特征向量': '线性代数·特征值与特征向量',
      '二次型': '线性代数·二次型',
      '随机事件和概率': '概率论·随机事件和概率',
      '随机变量及其分布': '概率论·随机变量及其分布',
      '多维随机变量及其分布': '概率论·多维随机变量及其分布',
      '随机变量的数字特征': '概率论·随机变量的数字特征',
      '大数定律和中心极限定理': '概率论·大数定律与中心极限定理',
      '数理统计的基本概念': '概率论·数理统计的基本概念',
      '参数估计': '概率论·参数估计',
      '假设检验': '概率论·假设检验',
      '一元函数微分学及其应用': '高等数学·一元函数微分学',
      '一元函数积分学及其应用': '高等数学·一元函数积分学',
      '空间解析几何': '高等数学·向量代数与空间解析几何',
      '多元函数微分学及其应用': '高等数学·多元函数微分学',
      '重积分及其应用': '高等数学·多元函数积分学',
      '微分方程及其应用': '高等数学·常微分方程',
      '曲线积分与曲面积分': '高等数学·多元函数积分学',
      '相似矩阵': '线性代数·特征值与特征向量',
      '随机事件及其概率': '概率论·随机事件和概率',
      '大数定律与中心极限定理': '概率论·大数定律与中心极限定理'
    };

    function inferPdfType(c) {
      if (c.options.length >= 2) return 'single';
      const ans = String(c.answer || '').trim();
      if (/^[A-Da-d]+$/.test(ans)) return 'single';
      return ans.length <= 40 ? 'fill' : 'solve';
    }

    function normalizePdfAnswer(type, ansRaw) {
      const raw = String(ansRaw == null ? '' : ansRaw).trim();
      if (type === 'single') return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
      if (type === 'multiple') return raw.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
      return raw;
    }

    function flushPdfQuestion() {
      const c = current;
      current = null;
      inAnalysis = false;
      const type = sectionType || inferPdfType(c);
      const q = {
        id: uid('q'),
        number: c.rawNo || String(c.number || ''),
        type: type,
        chapter: currentChapter,
        difficulty: 3,
        stem: c.stem.filter(Boolean).join(' ').trim(),
        options: c.options.map((o) => o.text),
        answer: normalizePdfAnswer(type, c.answer),
        analysis: c.analysis.join(' ').trim()
      };
      if (!q.stem) {
        errors.push('第 ' + c.number + ' 题题干为空，已跳过');
        return;
      }
      if (!q.answer) {
        q.analysis = (q.analysis ? q.analysis + ' ' : '') + '（未识别到答案，请在题库中补充）';
      }
      if ((q.type === 'single' || q.type === 'multiple') && q.options.length < 2) {
        q.analysis = (q.analysis ? q.analysis + ' ' : '') + '（未识别到完整选项，请在题库中补充）';
      }
      questions.push(q);
    }

    lines.forEach((line) => {
      if (/^第[一二三四五六七八九十百]+章/.test(line)) {
        const name = line.replace(/^第[一二三四五六七八九十百]+章\s*/, '').trim() || line.trim();
        currentChapter = chapterAlias[name] || name;
        return;
      }
      const sec = detectPdfSection(line);
      if (sec) {
        if (current) flushPdfQuestion();
        sectionType = sec;
        inAnalysis = false;
        return;
      }
      const qStart = line.match(/^(?:第\s*)?(\d+)\s*[\.、．)）]/) || line.match(/^[（(]\s*(\d+)\s*[）)]/);
      if (qStart && !/^答案/.test(line) && !/^[A-D][\.、．)）:：]/.test(line)) {
        if (current) flushPdfQuestion();
        current = {
          number: Number(qStart[1] || qStart[2]),
          rawNo: qStart[0].trim(),
          stem: [line.replace(qStart[0], '').trim()],
          options: [],
          answer: '',
          analysis: []
        };
        return;
      }
      if (!current) return;
      const optionSegs = splitPdfOptionsLine(line);
      if (optionSegs.length >= 2) {
        optionSegs.forEach((seg) => {
          const mm = seg.match(/^([A-D])[\.、．)）:：]\s*(.*)$/);
          if (mm) current.options.push({ letter: mm[1], text: mm[2].trim() });
        });
        return;
      }
      const singleOption = line.match(/^([A-D])[\.、．)）:：]\s*(.*)$/);
      if (singleOption && !current.answer) {
        current.options.push({ letter: singleOption[1], text: singleOption[2].trim() });
        return;
      }
      if (/^答案\s*[:：]?/.test(line)) {
        current.answer = line.replace(/^答案\s*[:：]?/, '').trim();
        return;
      }
      const ana = line.match(/^(解析|评析|解题思路|思路)\s*[:：]\s*(.*)$/);
      if (ana) {
        inAnalysis = true;
        if (ana[2]) current.analysis.push(ana[2]);
        return;
      }
      if (inAnalysis) {
        current.analysis.push(line);
        return;
      }
      if (!current.answer) current.stem.push(line);
    });
    if (current) flushPdfQuestion();
    return { questions: questions, errors: errors };
  }

  function normalizeRawQuestion(raw) {
    const typeMap = {
      single: 'single', 单选: 'single', 选择: 'single',
      multiple: 'multiple', 多选: 'multiple',
      fill: 'fill', 填空: 'fill',
      solve: 'solve', 解答: 'solve', 计算: 'solve'
    };
    const type = typeMap[String(raw && raw.type || '').trim().toLowerCase()] || typeMap[String(raw && raw.type || '').trim()];
    if (!type) return { error: '存在未知题型或题型为空，已跳过' };
    if (!raw || !String(raw.stem || '').trim()) return { error: '存在题干为空的条目，已跳过' };
    let options = [];
    if (Array.isArray(raw.options)) options = raw.options.map(String);
    else if (raw.options != null) options = String(raw.options).split(/[|\n]/).map((s) => s.trim()).filter(Boolean);
    if ((type === 'single' || type === 'multiple') && options.length < 2) return { error: '选择题选项不足 2 个，已跳过' };
    let answer = '';
    if (type === 'single') {
      answer = String(raw.answer || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    } else if (type === 'multiple') {
      const joined = Array.isArray(raw.answer) ? raw.answer.join('') : String(raw.answer || '');
      answer = joined.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
    } else {
      answer = String(raw.answer == null ? '' : raw.answer).trim();
    }
    if (!answer) return { error: '答案为空，已跳过' };
    return {
      q: {
        id: uid('q'),
        number: raw.number != null ? String(raw.number).trim() : '',
        type: type,
        chapter: String(raw.chapter || '未分类').trim() || '未分类',
        difficulty: Math.min(5, Math.max(1, Math.round(Number(raw.difficulty) || 3))),
        stem: String(raw.stem).trim(),
        options: options,
        answer: answer,
        analysis: String(raw.analysis || '').trim()
      }
    };
  }

  function mergeBank(mode) {
    if (!uploadParsed) return;
    if (uploadParsed.isImage) { mergeImageBank(mode); return; }
    if (auth.active) {
      // 云端模式：逐题写入后端，并按题库名归并到同一自定义题库（带 bankId+bankName，刷新后可重建目录）
      const nameInput = $('#uploadBankName');
      const bankName = (nameInput && nameInput.value.trim()) || uploadParsed.bankName || defaultUploadBankName();
      // 复用同名已有题库的 bankId，避免重复创建
      const exist = state.banks.find((b) => b.id !== 'bank_total' && b.name === bankName);
      const bankId = exist ? exist.id : uid('bank');
      const qs = uploadParsed.questions.map((q) => Object.assign({}, q, { bankId: bankId, bankName: bankName }));
      uploadParsed = null; showUpload = false;
      (async function () {
        let n = 0;
        for (const q of qs) {
          try { await API.addQuestion(auth.token, q); n++; } catch (e) { console.warn('[云端] 导入题目失败', e); }
        }
        await loadBankFromServer();
        toast('已导入 ' + n + ' 道题到「' + bankName + '」');
        render();
      })();
      return;
    }
    const nameInput = $('#uploadBankName');
    const name = (nameInput && nameInput.value.trim()) || uploadParsed.bankName || defaultUploadBankName();
    let bank = state.banks.find((b) => b.name === name);
    if (mode === 'replace') {
      state.bank = [];
      state.banks = [state.banks.find((b) => b.id === 'bank_total') || { id: 'bank_total', name: '总题库', createdAt: new Date().toISOString() }];
      bank = null;
    }
    if (!bank) {
      bank = { id: uid('bank'), name: name, createdAt: new Date().toISOString() };
      state.banks.push(bank);
    }
    const existing = new Set(state.bank.map((q) => q.stem + '|' + q.chapter));
    let added = 0;
    uploadParsed.questions.forEach((q) => {
      if (mode === 'append' && existing.has(q.stem + '|' + q.chapter)) return;
      q.bankId = bank.id;
      state.bank.push(q);
      existing.add(q.stem + '|' + q.chapter);
      added++;
    });
    saveData();
    uploadParsed = null;
    toast('已入库 ' + added + ' 道题到「' + name + '」');
    render();
  }

  // 图片题库入库：题目（含 dataURL）写入 IndexedDB（本机缓存，刷新不丢）；
  // 云端模式下同时逐题写入后端，实现跨设备/跨浏览器同步（换设备也能看到图片题库）
  async function mergeImageBank(mode) {
    const nameInput = $('#uploadBankName');
    const name = (nameInput && nameInput.value.trim()) || uploadParsed.bankName || defaultUploadBankName();
    let bank = state.banks.find((b) => b.id !== 'bank_total' && b.name === name);
    if (mode === 'replace') {
      if (bank && imgBankIds.has(bank.id)) { try { await idbDeleteBank(bank.id); } catch (e) {} imgBankIds.delete(bank.id); }
      state.banks = state.banks.filter((b) => b.id === 'bank_total' || !imgBankIds.has(b.id));
      state.bank = state.bank.filter((q) => !imgBankIds.has(q.bankId));
      bank = null;
    }
    if (!bank) {
      bank = { id: uid('bank'), name: name, createdAt: new Date().toISOString(), userBank: true, imgBank: true };
      state.banks.push(bank);
    }
    imgBankIds.add(bank.id);
    const qs = uploadParsed.questions.map((q) => Object.assign({}, q, { bankId: bank.id, isImage: true }));
    state.bank = state.bank.concat(qs);
    try {
      await idbPutBank({ id: bank.id, name: bank.name, createdAt: bank.createdAt, questions: qs });
    } catch (e) {
      console.warn('图片题库本机保存失败', e);
      toast('当前浏览器不支持本地数据库，图片题库仅在本次打开期间有效');
    }
    if (auth.active) {
      uploadParsed = null; saveData(); render();
      (async function () {
        let n = 0, err = 0, batchNo = 0;
        toast('正在同步 ' + qs.length + ' 道图片题到云端（预计 10-60 秒，请勿关闭页面）…');
        // 分批上云：每批按累计体积切（约 45MB），整批只触发一次 git-sync，避免逐题推送累积成几十分钟
        const BATCH_BYTES = 45 * 1024 * 1024;
        let batch = [], batchLen = 0;
        const flush = async () => {
          if (!batch.length) return;
          batchNo++;
          try {
            const r = await API.addQuestionsBatch(auth.token, batch);
            n += (r && typeof r.added === 'number' ? r.added : batch.length);
          } catch (e) { err += batch.length; console.warn('[云端] 批量上传失败', e); }
          batch = []; batchLen = 0;
          toast('云端同步中… ' + Math.min(n + err, qs.length) + '/' + qs.length + ' 道');
        };
        for (const q of qs) {
          const payload = Object.assign({}, q, { bankId: bank.id, bankName: name, isImage: true });
          if (q.img && q.img.length > 600000) { // 大图压缩，减小云端体积并避免超服务端上限
            try { payload.img = await downScaleDataUrl(q.img, 1280, 0.72); } catch (e) {}
          }
          const len = payload.img ? payload.img.length : (payload.stem || '').length;
          if (batchLen + len > BATCH_BYTES && batch.length) await flush();
          batch.push(payload); batchLen += len;
        }
        await flush();
        await loadBankFromServer();
        if (err === 0) {
          toast('✅ 已同步 ' + n + '/' + qs.length + ' 道图片题到云端（换设备可同步；云端落库约需 20 秒，请稍候再刷新/换设备）');
        } else {
          toast('⚠️ 已同步 ' + n + ' 道，' + err + ' 道上传失败（检查网络后重新上传该题库）');
        }
        render();
      })();
      return;
    }
    uploadParsed = null; saveData();
    toast('⚠️ 未登录：图片题仅存本机浏览器，换设备/换浏览器不可见！请先登录 DB 账号再上传');
    render();
  }

  // 删除图片题后，异步把对应图片题库在 IndexedDB 中同步（不阻塞 UI）
  function syncImgBankDeleteQuestion(bankId, qid) {
    idbGetBank(bankId).then((rec) => {
      if (!rec) return;
      rec.questions = (rec.questions || []).filter((x) => x.id !== qid);
      if (!rec.questions.length) return idbDeleteBank(bankId).then(() => { imgBankIds.delete(bankId); }).catch(() => {});
      return idbPutBank(rec);
    }).catch((e) => console.warn('更新图片题库失败', e));
  }

  function openQuestionModal(qid) {
    const q = qid ? qById(qid) : null;
    const chapters = unionChapters();
    const chapterOptions = chapters.map((c) => '<option value="' + esc(c) + '"' + (q && q.chapter === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
    const typeOptions = Object.keys(TYPE_LABEL).map((t) => '<option value="' + t + '"' + ((q && q.type === t) || (!q && t === 'single') ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>').join('');
    const diffOptions = [1, 2, 3, 4, 5].map((d) => '<option value="' + d + '"' + ((q ? Number(q.difficulty) : 3) === d ? ' selected' : '') + '>' + stars(d) + '</option>').join('');
    const bankOptions = state.banks.map((b) => '<option value="' + esc(b.id) + '"' + ((q && q.bankId === b.id) || (!q && b.id === 'bank_total') ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('');
    openModal(`
      <div class="modal-head"><h2 class="modal-title">${q ? '编辑题目' : '添加题目'}</h2>
        <button class="btn btn-ghost btn-sm" data-action="close-modal" type="button">${icon('x', 'icon-sm')}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label class="field-label" for="mqBank">所属题库</label>
            <select class="select" id="mqBank">${bankOptions}</select></div>
          <div class="field full"><label class="field-label" for="mqNumber">题号（可选）</label>
            <input class="input" id="mqNumber" value="${esc(q ? q.number || '' : '')}" placeholder="例如：(1) 或 第1题"></div>
          <div class="field"><label class="field-label" for="mqType">题型</label>
            <select class="select" id="mqType">${typeOptions}</select></div>
          <div class="field"><label class="field-label" for="mqDiff">难度</label>
            <select class="select" id="mqDiff">${diffOptions}</select></div>
          <div class="field full"><label class="field-label" for="mqChapter">章节</label>
            <input class="input" id="mqChapter" list="mqChapters" value="${esc(q ? q.chapter : '')}" placeholder="输入或选择章节">
            <datalist id="mqChapters">${chapterOptions}</datalist></div>
          <div class="field full"><label class="field-label" for="mqStem">题干</label>
            <textarea class="textarea" id="mqStem" rows="3" placeholder="输入题目内容">${esc(q ? q.stem : '')}</textarea></div>
          <div class="field full"><label class="field-label" for="mqOptions">选项（每行一个，填空与解答题可留空）</label>
            <textarea class="textarea" id="mqOptions" rows="4" placeholder="A 选项&#10;B 选项">${esc(q && q.options ? q.options.join('\n') : '')}</textarea></div>
          <div class="field full"><label class="field-label" for="mqAnswer">答案</label>
            <input class="input" id="mqAnswer" value="${esc(q ? q.answer : '')}" placeholder="单选填 A；多选填 AB；填空/解答填答案或要点"></div>
          <div class="field full"><label class="field-label" for="mqAnalysis">解析</label>
            <textarea class="textarea" id="mqAnalysis" rows="3" placeholder="解析步骤（可选）">${esc(q ? q.analysis : '')}</textarea></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="close-modal" type="button">取消</button>
        <button class="btn btn-primary" data-action="save-question" data-qid="${q ? esc(q.id) : ''}" type="button">保存题目</button>
      </div>`);
  }

  function saveQuestion(qid) {
    const type = $('#mqType').value;
    const stem = $('#mqStem').value.trim();
    const chapter = $('#mqChapter').value.trim() || '未分类';
    const difficulty = Number($('#mqDiff').value) || 3;
    const answer = $('#mqAnswer').value.trim();
    const analysis = $('#mqAnalysis').value.trim();
    if (!stem) return toast('题干不能为空');
    const rawOptions = $('#mqOptions').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if ((type === 'single' || type === 'multiple') && rawOptions.length < 2) return toast('选择题至少需要 2 个选项');
    if (!answer) return toast('答案不能为空');
    const existing = qid ? qById(qid) : null;
    const bankId = $('#mqBank') ? $('#mqBank').value : 'bank_total';
    const number = $('#mqNumber') ? $('#mqNumber').value.trim() : '';
    const q = {
      id: existing ? existing.id : uid('q'),
      bankId: bankId,
      number: number,
      type: type,
      chapter: chapter,
      difficulty: difficulty,
      stem: stem,
      options: rawOptions,
      answer: type === 'single' ? answer.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1)
        : type === 'multiple' ? answer.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('')
          : answer,
      analysis: analysis
    };
    if (auth.active) { apiSaveQuestion(q, qid); return; }
    if (existing) {
      const i = state.bank.findIndex((x) => x.id === qid);
      state.bank[i] = q;
    } else {
      state.bank.push(q);
    }
    saveData();
    closeModal();
    toast('题目已保存');
    if (view === 'group') render();
    else render();
  }

  function autoPick() {
    const chapters = group.chapters;
    const candidates = state.bank.filter((q) => {
      if (!chapters.has(q.chapter)) return false;
      if (group.bank !== 'all' && q.bankId !== group.bank) return false;
      if (!diffOk(q.difficulty, group.diff)) return false;
      if (group.excludeComposed && (state.composeCount[q.id] || 0) > 0) return false;
      return true;
    });
    const selIds = new Set(group.sel.map((s) => s.qid));
    let added = 0;
    Object.keys(group.counts).forEach((type) => {
      const n = Number(group.counts[type]) || 0;
      const pool = shuffle(candidates.filter((q) => q.type === type && !selIds.has(q.id)));
      pool.slice(0, n).forEach((q) => {
        group.sel.push({ qid: q.id, score: Number(group.scores[q.type]) || DEFAULT_SCORE[q.type] || 4 });
        selIds.add(q.id);
        added++;
      });
    });
    if (added) toast('随机加入 ' + added + ' 道题');
    else toast('没有更多符合条件的题目');
    render();
  }

  function diffOk(diff, mode) {
    if (mode === 'all') return true;
    if (mode === 'easy') return Number(diff) <= 2;
    if (mode === 'mid') return Number(diff) >= 3 && Number(diff) <= 4;
    if (mode === 'hard') return Number(diff) >= 5;
    return true;
  }

  function addOne(qid) {
    const q = qById(qid);
    if (!q) return;
    if (group.sel.some((s) => s.qid === qid)) return toast('该题已在试卷中');
    group.sel.push({ qid: qid, score: Number(group.scores[q.type]) || DEFAULT_SCORE[q.type] || 4 });
    render();
  }

  function addSelected() {
    const checks = $$('[data-pick]:checked');
    if (!checks.length) return toast('请先勾选题目');
    let added = 0;
    checks.forEach((c) => {
      const q = qById(c.dataset.pick);
      if (q && !group.sel.some((s) => s.qid === q.id)) {
        group.sel.push({ qid: q.id, score: Number(group.scores[q.type]) || DEFAULT_SCORE[q.type] || 4 });
        added++;
      }
    });
    toast('已加入 ' + added + ' 题');
    render();
  }

  function removeSel(i) {
    group.sel.splice(i, 1);
    render();
  }

  function moveSel(i, dir) {
    const j = i + Number(dir);
    if (j < 0 || j >= group.sel.length) return;
    [group.sel[i], group.sel[j]] = [group.sel[j], group.sel[i]];
    render();
  }

  function savePaper() {
    if (!group.sel.length) return toast('请先添加题目');
    const title = group.title.trim() || ('模拟卷 ' + new Date().toLocaleDateString('zh-CN'));
    const scores = {};
    group.sel.forEach((s) => {
      const q = qById(s.qid);
      scores[s.qid] = Math.max(1, Number(s.score) || (q ? DEFAULT_SCORE[q.type] : 4));
      state.composeCount[s.qid] = (state.composeCount[s.qid] || 0) + 1;
    });
    state.papers.push({
      id: uid('p'),
      title: title,
      createdAt: new Date().toISOString(),
      qids: group.sel.map((s) => s.qid),
      scores: scores,
      duration: Number(group.duration) || 0
    });
    saveData();
    group.sel = [];
    group.title = '';
    toast('试卷已创建');
    view = 'practice';
    render();
  }

  function startPaper(pid) {
    const p = state.papers.find((x) => x.id === pid);
    if (!p || !p.qids.length) return toast('试卷为空');
    session = {
      mode: 'paper',
      paperId: p.id,
      title: p.title,
      qids: p.qids.slice(),
      scores: p.scores || {},
      answers: {},
      graded: {},
      score: 0,
      total: 0,
      wrongIds: [],
      duration: p.duration || 0,
      idx: 0,
      phase: 'exam',
      attemptId: null
    };
    render();
  }

  function gradeSession() {
    const s = session;
    let score = 0;
    let total = 0;
    const wrongIds = [];
    const graded = {};
    s.qids.forEach((qid) => {
      const q = qById(qid);
      if (!q) return;
      const sc = (s.scores && s.scores[qid]) || DEFAULT_SCORE[q.type] || 4;
      total += sc;
      const ans = s.answers[qid];
      let ok = null;
      if (q.type === 'single') ok = String(ans || '') === q.answer;
      else if (q.type === 'multiple') ok = normalizeText(ans) === normalizeText(q.answer);
      else if (q.type === 'fill') ok = normalizeText(ans) === normalizeText(q.answer);
      graded[qid] = ok;
      if (ok === true) score += sc;
      else if (ok === false) wrongIds.push(qid);
    });
    s.graded = graded;
    s.score = score;
    s.total = total;
    s.wrongIds = wrongIds;
    s.phase = 'result';
    wrongIds.forEach((qid) => addWrongEntry(qid));
    if (s.mode === 'paper') {
      const att = {
        id: uid('a'),
        paperId: s.paperId,
        title: s.title,
        date: new Date().toISOString(),
        score: score,
        total: total,
        wrongIds: wrongIds.slice()
      };
      state.attempts.push(att);
      s.attemptId = att.id;
    }
    saveData();
    render();
  }

  function addWrongEntry(qid) {
    ensureDefaultWrongBook();
    var wb = getActiveWrongBook();
    wb.entries = wb.entries || [];
    var w = wb.entries.find(function(x) { return x.qid === qid; });
    if (w) {
      w.wrongCount = (w.wrongCount || 0) + 1;
      w.lastAt = new Date().toISOString();
      w.mastered = false;
    } else {
      wb.entries.push({ qid: qid, wrongCount: 1, lastAt: new Date().toISOString(), mastered: false });
    }
  }

  function selfCheck(qid, correct) {
    const s = session;
    const q = qById(qid);
    if (!q || s.graded[qid] != null) return;
    const sc = (s.scores && s.scores[qid]) || DEFAULT_SCORE[q.type] || 4;
    s.graded[qid] = correct;
    if (correct) {
      s.score += sc;
    } else {
      if (!s.wrongIds.includes(qid)) s.wrongIds.push(qid);
      addWrongEntry(qid);
    }
    if (s.attemptId) {
      const att = state.attempts.find((a) => a.id === s.attemptId);
      if (att) {
        att.score = s.score;
        att.wrongIds = s.wrongIds.slice();
      }
    }
    saveData();
    render();
  }

  function startTimer() {
    stopTimer();
    const el = $('#examTimer');
    if (!session || !session.duration) {
      if (el) el.textContent = '';
      return;
    }
    if (!session.endAt) session.endAt = Date.now() + session.duration * 60 * 1000;
    const tick = () => {
      const remain = Math.max(0, Math.round((session.endAt - Date.now()) / 1000));
      const box = $('#examTimer');
      if (box) box.textContent = fmtClock(remain);
      if (remain <= 0) {
        stopTimer();
        if (session && session.phase === 'exam') gradeSession();
      }
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startTopTimer() {
    if (topTimer.running) return;
    topTimer.running = true;
    topTimer.handle = setInterval(function() {
      topTimer.seconds++;
      var td = $('#timerDisplay');
      if (td) {
        var m = Math.floor(topTimer.seconds / 60);
        var s = topTimer.seconds % 60;
        td.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
    }, 1000);
    var td2 = $('#timerDisplay');
    if (td2) {
      var m2 = Math.floor(topTimer.seconds / 60);
      var s2 = topTimer.seconds % 60;
      td2.textContent = (m2 < 10 ? '0' : '') + m2 + ':' + (s2 < 10 ? '0' : '') + s2;
    }
  }

  function stopTopTimer() {
    topTimer.running = false;
    if (topTimer.handle) {
      clearInterval(topTimer.handle);
      topTimer.handle = null;
    }
    var td = $('#timerDisplay');
    if (td) td.textContent = '';
  }

  function endSession() {
    stopTimer();
    session = null;
    render();
  }

  function redoWrong(qid) {
    const q = qById(qid);
    if (!q) return;
    session = {
      mode: 'wrong',
      title: '错题重做',
      qids: [qid],
      scores: { [qid]: DEFAULT_SCORE[q.type] || 4 },
      answers: {},
      graded: {},
      score: 0,
      total: DEFAULT_SCORE[q.type] || 4,
      wrongIds: [],
      duration: 0,
      idx: 0,
      phase: 'exam',
      attemptId: null
    };
    view = 'practice';
    render();
  }

  function markMastered(qid) {
    var wb = getActiveWrongBook();
    var w = (wb.entries || []).find(function(x) { return x.qid === qid; });
    if (w) {
      w.mastered = true;
      saveData();
      toast('已标记掌握');
      render();
    }
  }

  function unmaster(qid) {
    var wb = getActiveWrongBook();
    var w = (wb.entries || []).find(function(x) { return x.qid === qid; });
    if (w) {
      w.mastered = false;
      saveData();
      render();
    }
  }

  function removeWrong(qid) {
    var wb = getActiveWrongBook();
    wb.entries = (wb.entries || []).filter(function(x) { return x.qid !== qid; });
    saveData();
    toast('已从错题本移除');
    render();
  }

  // ── 多错题本管理 ──

  function createWrongBook(name) {
    ensureDefaultWrongBook();
    var id = 'wb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    state.wrongBooks.push({ id: id, name: name, createdAt: new Date().toISOString(), entries: [] });
    state.activeWrongBookId = id;
    saveData();
  }

  function deleteWrongBook(wbId) {
    state.wrongBooks = (state.wrongBooks || []).filter(function(wb) { return wb.id !== wbId; });
    if (state.activeWrongBookId === wbId) {
      state.activeWrongBookId = state.wrongBooks.length ? state.wrongBooks[0].id : '';
    }
    if (!state.wrongBooks.length) {
      state.wrongBooks = [];
      state.activeWrongBookId = '';
    }
    saveData();
    toast('错题本已删除');
    render();
  }

  function renameWrongBook(wbId, newName) {
    var wb = state.wrongBooks.find(function(b) { return b.id === wbId; });
    if (wb) {
      wb.name = newName;
      saveData();
      toast('错题本已重命名');
      render();
    }
  }

  // 将指定 qid 加入指定错题本
  function addQidToWrongBook(qid, wbId) {
    ensureDefaultWrongBook();
    var wb = state.wrongBooks.find(function(b) { return b.id === wbId; }) || getActiveWrongBook();
    wb.entries = wb.entries || [];
    var existing = wb.entries.find(function(e) { return e.qid === qid; });
    if (existing) {
      existing.wrongCount = (existing.wrongCount || 0) + 1;
      existing.lastAt = new Date().toISOString();
      existing.mastered = false;
    } else {
      wb.entries.push({ qid: qid, wrongCount: 1, lastAt: new Date().toISOString(), mastered: false });
    }
    saveData();
  }

  // 弹出选择错题本弹窗（用于单题加入）
  function openWrongBookPicker(qid) {
    ensureDefaultWrongBook();
    var options = (state.wrongBooks || []).map(function(wb) {
      return '<button class="btn btn-block" data-action="add-to-wrong-book" data-qid="' + esc(qid) + '" data-wbid="' + esc(wb.id) + '" type="button" style="margin-bottom:6px;justify-content:flex-start">' + icon('bookmark', 'icon-sm') + esc(wb.name) + '</button>';
    }).join('');
    openModal('\n      <div class="modal-head"><h2 class="modal-title">选择错题本</h2></div>\n      <div class="modal-body">\n        ' + (options || '<div class="empty-state">还没有错题本</div>') + '\n        <hr style="margin:12px 0;border-color:rgba(255,255,255,.08)">\n        <div class="field">\n          <label class="field-label">或新建错题本</label>\n          <div style="display:flex;gap:8px">\n            <input class="input" id="newWrongBookName" type="text" placeholder="输入错题本名称" style="flex:1">\n            <button class="btn btn-primary" data-action="new-wrong-book-and-add" data-qid="' + esc(qid) + '" type="button">新建并加入</button>\n          </div>\n        </div>\n      </div>\n      <div class="modal-foot">\n        <button class="btn" data-action="close-modal" type="button">取消</button>\n      </div>');
  }

  // 弹出批量选择错题本弹窗（用于题库管理批量加入）
  function openBatchWrongBookPicker(qids) {
    ensureDefaultWrongBook();
    var idsJson = JSON.stringify(qids);
    var options = (state.wrongBooks || []).map(function(wb) {
      return '<button class="btn btn-block" data-action="batch-add-to-wrong-book" data-qids="' + esc(idsJson) + '" data-wbid="' + esc(wb.id) + '" type="button" style="margin-bottom:6px;justify-content:flex-start">' + icon('bookmark', 'icon-sm') + esc(wb.name) + '</button>';
    }).join('');
    openModal('\n      <div class="modal-head"><h2 class="modal-title">批量加入错题本（' + qids.length + ' 题）</h2></div>\n      <div class="modal-body">\n        <p>选择目标错题本：</p>\n        ' + (options || '<div class="empty-state">还没有错题本</div>') + '\n        <hr style="margin:12px 0;border-color:rgba(255,255,255,.08)">\n        <div class="field">\n          <label class="field-label">或新建错题本</label>\n          <div style="display:flex;gap:8px">\n            <input class="input" id="newWrongBookName" type="text" placeholder="输入错题本名称" style="flex:1">\n            <button class="btn btn-primary" data-action="new-wrong-book-and-batch-add" data-qids="' + esc(idsJson) + '" type="button">新建并加入</button>\n          </div>\n        </div>\n      </div>\n      <div class="modal-foot">\n        <button class="btn" data-action="close-modal" type="button">取消</button>\n      </div>');
  }

  function exportData() {
    const payload = { app: 'kaoyan-math', version: 1, exportedAt: new Date().toISOString(), data: state };
    downloadText('研数工坊数据备份-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    toast('备份已导出');
  }

  /* ========== PDF 导出（通过浏览器打印生成 PDF） ========== */

  function buildQuestionHTML(q, index, opts) {
    opts = opts || {};
    var typeLabel = TYPE_LABEL[q.type] || '题目';
    var score = opts.score || DEFAULT_SCORE[q.type] || 4;
    // 选择/填空：紧凑排版；解答题(大题)：预留作答空白
    var itemCls = '';
    if (q.type === 'single' || q.type === 'fill') itemCls = ' compact';
    else if (q.type === 'solve') itemCls = ' with-blank';
    var html = '<div class="q-item' + itemCls + '">';
    html += '<div class="q-line">';
    html += '<span class="q-num">' + (index + 1) + '.</span>';
    html += '<span class="q-type">[' + typeLabel + ']</span>';
    if (opts.showScore) html += '<span class="q-score">(' + score + '分)</span>';
    html += '</div>';
    html += '<div class="q-stem-text">' + stemMedia(q) + '</div>';
    // 有原书裁图时，题目与自带选项已在图片内，导出不再重复列出选项
    if (q.options && q.options.length && !q.img) {
      html += '<div class="q-options">';
      var labels = 'ABCDEFGH';
      for (var i = 0; i < q.options.length; i++) {
        html += '<div class="q-opt"><span class="opt-label">' + labels[i] + '.</span> ' + mathHTML(q.options[i]) + '</div>';
      }
      html += '</div>';
    }
    if (q.type === 'solve') {
      html += '<div class="q-blank"></div>';
    }
    if (opts.showAnswer && q.answer) {
      html += '<div class="q-answer"><span class="ans-label">【答案】</span>' + mathHTML(q.answer) + '</div>';
    }
    if (opts.showAnalysis && q.analysis) {
      html += '<div class="q-analysis"><span class="ans-label">【解析】</span>' + mathHTML(q.analysis) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function openPrintWindow(title, bodyHTML) {
    var w = window.open('', '_blank');
    if (!w) { toast('请允许弹窗以导出 PDF'); return; }
    var d = new Date();
    var dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">';
    html += '<meta name="viewport" content="width=device-width, initial-scale=1">';
    html += '<title>' + esc(title) + '</title>';
    html += '<link rel="stylesheet" href="vendor/katex/katex.min.css">';
    html += '<style>';
    html += '@media print { @page { margin: 1.5cm; } body { font-size: 11pt; } }';
    html += 'body { font-family: "Segoe UI","Microsoft YaHei","PingFang SC",sans-serif; color:#1c2530; line-height:1.7; max-width:780px; margin:0 auto; padding:20px; }';
    html += '.doc-head { text-align:center; margin-bottom:24px; padding-bottom:12px; border-bottom:2px solid #1a2744; }';
    html += '.doc-head h1 { font-size:20px; margin:0 0 6px; color:#1a2744; }';
    html += '.doc-head .doc-info { font-size:12px; color:#5f6b7a; }';
    html += '.doc-section-title { font-size:15px; font-weight:bold; color:#1a2744; margin:18px 0 8px; padding-left:8px; border-left:3px solid #2563eb; }';
    html += '.q-item { margin-bottom:18px; padding:12px 0; border-bottom:1px dashed #e2e8f0; page-break-inside:avoid; }';
    html += '.q-item:last-child { border-bottom:none; }';
    html += '.q-line { display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }';
    html += '.q-num { font-weight:bold; font-size:13px; }';
    html += '.q-type { font-size:11px; color:#2563eb; background:#eaf1ff; padding:1px 6px; border-radius:3px; }';
    html += '.q-score { font-size:11px; color:#5f6b7a; }';
    html += '.q-stem-text { margin:4px 0 6px; font-size:13px; }';
    html += '.q-stem-text .math-render { display:inline; }';
    html += '.q-stem-text img { display:block; max-width:100%; height:auto; margin:2px 0; background:#fff; }';
    html += '.q-item.compact { margin-bottom:6px; padding:5px 0; }';
    html += '.q-item.compact .q-line { margin-bottom:1px; }';
    html += '.q-item.compact .q-stem-text { margin:1px 0 2px; }';
    html += '.q-item.compact .q-stem-text img { max-height:300px; width:auto; }';
    html += '.q-item.with-blank .q-blank { min-height:140px; margin:10px 2px 4px; border:1px solid #cbd5e1; border-left:3px solid #94a3b8; background:repeating-linear-gradient(to bottom,#ffffff 0,#ffffff 31px,#eef2f7 31px,#eef2f7 32px); }';
    html += '.q-options { margin:4px 0 4px 20px; }';
    html += '.q-opt { margin:2px 0; font-size:13px; }';
    html += '.opt-label { font-weight:bold; margin-right:4px; }';
    html += '.q-answer { margin:6px 0 2px; font-size:12px; color:#0e9f6e; }';
    html += '.q-analysis { margin:2px 0; font-size:12px; color:#5f6b7a; }';
    html += '.ans-label { font-weight:bold; }';
    html += '.doc-foot { text-align:center; margin-top:20px; font-size:11px; color:#8a94a3; border-top:1px solid #e2e8f0; padding-top:8px; }';
    html += '.katex { font-size:1.05em; }';
    html += '.katex-display { margin:8px 0; overflow-x:auto; }';
    html += '</style></head><body>';
    html += '<div class="doc-head"><h1>' + esc(title) + '</h1>';
    html += '<div class="doc-info">导出日期：' + dateStr + ' · 研数工坊</div></div>';
    html += bodyHTML;
    html += '<div class="doc-foot">由研数工坊自动生成</div>';
    html += '<script>';
    html += 'window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 300); });';
    html += '<\/script>';
    html += '</body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function exportPaperPDF(pid) {
    var p = state.papers.find(function(x){ return x.id === pid; });
    if (!p) { toast('试卷不存在'); return; }
    var title = p.title || '未命名试卷';
    var totalScore = paperTotal(p);
    var qCount = (p.qids || []).length;

    /* Group questions by type */
    var groups = { single: [], multiple: [], fill: [], solve: [] };
    (p.qids || []).forEach(function(qid, i) {
      var q = qById(qid);
      if (!q) return;
      var score = (p.scores && p.scores[qid]) ? Number(p.scores[qid]) : DEFAULT_SCORE[q.type] || 4;
      groups[q.type] = groups[q.type] || [];
      groups[q.type].push({ q: q, score: score, globalIdx: i });
    });

    var body = '';
    body += '<div class="doc-info" style="text-align:center;margin-bottom:16px;">';
    body += '共 ' + qCount + ' 题 · 满分 ' + totalScore + ' 分';
    if (p.duration) body += ' · 限时 ' + p.duration + ' 分钟';
    body += '</div>';

    var sectionTitles = {
      single: '一、单项选择题',
      multiple: '二、多项选择题',
      fill: '三、填空题',
      solve: '四、解答题'
    };
    var sectionIdx = 0;
    ['single', 'multiple', 'fill', 'solve'].forEach(function(type) {
      if (!groups[type] || !groups[type].length) return;
      sectionIdx++;
      var labelMap = { single: '一', multiple: '二', fill: '三', solve: '四' };
      body += '<div class="doc-section-title">' + (labelMap[type] || '') + '、' + TYPE_LABEL[type] + '（共' + groups[type].length + '题）</div>';
      groups[type].forEach(function(item, i) {
        body += buildQuestionHTML(item.q, i, { showScore: true, score: item.score });
      });
    });

    /* Answer sheet on separate page */
    body += '<div style="page-break-before:always;"></div>';
    body += '<div class="doc-section-title">参考答案</div>';
    var hasAns = false;
    (p.qids || []).forEach(function(qid, i) {
      var q = qById(qid);
      if (!q || !q.answer) return;
      hasAns = true;
      body += '<div style="margin-bottom:4px;font-size:12px;"><b>' + (i+1) + '.</b> ' + esc(q.answer) + '</div>';
    });
    if (!hasAns) body += '<div style="font-size:12px;color:#8a94a3;">暂无答案</div>';

    openPrintWindow(title, body);
    toast('正在生成 PDF，请在弹窗中选择"另存为 PDF"');
  }

  function exportWrongPDF() {
    var wb = getActiveWrongBook();
    var list = (wb.entries || []).filter(function(w) {
      var q = qById(w.qid);
      if (!q) return false;
      if (wrongFilter.status === 'pending' && w.mastered) return false;
      if (wrongFilter.status === 'mastered' && !w.mastered) return false;
      if (wrongFilter.chapter !== 'all' && q.chapter !== wrongFilter.chapter) return false;
      if (wrongFilter.type !== 'all' && q.type !== wrongFilter.type) return false;
      return true;
    });

    if (!list.length) { toast('当前筛选条件下没有错题'); return; }

    var title = '错题本';
    var body = '';
    body += '<div class="doc-info" style="text-align:center;margin-bottom:16px;">';
    body += '共 ' + list.length + ' 道错题';
    var pending = list.filter(function(w){ return !w.mastered; }).length;
    var mastered = list.length - pending;
    body += ' · 待攻克 ' + pending + ' · 已掌握 ' + mastered;
    body += '</div>';

    /* Group by chapter */
    var chapters = {};
    list.forEach(function(w) {
      var q = qById(w.qid);
      if (!q) return;
      if (!chapters[q.chapter]) chapters[q.chapter] = [];
      chapters[q.chapter].push({ q: q, w: w });
    });

    Object.keys(chapters).forEach(function(ch) {
      body += '<div class="doc-section-title">' + esc(ch) + '（' + chapters[ch].length + '题）</div>';
      chapters[ch].forEach(function(item, i) {
        var q = item.q;
        var w = item.w;
        var opts = { showAnswer: true, showAnalysis: !!q.analysis };
        body += buildQuestionHTML(q, i, opts);
        body += '<div class="q-answer"><span class="ans-label">[错次]</span> ' + (w.wrongCount||1) + ' 次 · ' + (w.mastered ? '已掌握' : '待攻克') + '</div>';
      });
    });

    openPrintWindow(title, body);
    toast('正在生成 PDF，请在弹窗中选择"另存为 PDF"');
  }

  async function importData(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const data = payload && payload.data ? payload.data : payload;
      state = normalizeData(data);
      saveData();
      toast('数据已导入');
      render();
    } catch (e) {
      toast('导入失败：不是有效的备份文件');
    }
  }

  function downloadTemplate(format) {
    if (format === 'json') {
      const sample = {
        name: '我的考研数学题库',
        questions: [
          { type: 'single', chapter: '极限与连续', difficulty: 2, stem: 'lim_{x→0} sin x / x = ?', options: ['0', '1', '2', '不存在'], answer: 'B', analysis: '第一个重要极限。' },
          { type: 'fill', chapter: '线性代数', difficulty: 1, stem: '|E₂| = ______。', options: [], answer: '1', analysis: '单位矩阵的行列式为 1。' }
        ]
      };
      downloadText('题库模板.json', JSON.stringify(sample, null, 2), 'application/json;charset=utf-8');
    } else {
      const rows = [
        ['type', 'chapter', 'difficulty', 'stem', 'options', 'answer', 'analysis'],
        ['single', '极限与连续', '2', 'lim_{x→0} sin x / x = ?', '0|1|2|不存在', 'B', '第一个重要极限。'],
        ['fill', '线性代数', '1', '|E₂| = ______。', '', '1', '单位矩阵的行列式为 1。']
      ];
      downloadText('题库模板.csv', rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    }
  }

  function csvCell(s) {
    const v = String(s == null ? '' : s);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function openRenameBankModal(bankId) {
    const bank = state.banks.find((b) => b.id === bankId);
    if (!bank) return;
    openModal(`
      <div class="modal-head"><h2 class="modal-title">重命名题库</h2></div>
      <div class="modal-body">
        <div class="field"><label class="field-label" for="renameBankInput">题库名称</label>
          <input class="input" id="renameBankInput" type="text" value="${esc(bank.name)}"></div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-action="close-modal" type="button">取消</button>
        <button class="btn btn-primary" data-action="rename-bank-confirm" data-param="${esc(bank.id)}" type="button">保存</button>
      </div>`);
  }

  function openModal(html) {
    const modal = $('#modal');
    modal.innerHTML = html;
    if (!modal.open) modal.showModal();
  }

  function closeModal() {
    const modal = $('#modal');
    if (modal.open) modal.close();
  }

  function confirmModal(title, body, action, param) {
    openModal(`
      <div class="modal-head"><h2 class="modal-title">${esc(title)}</h2></div>
      <div class="modal-body">${esc(body)}</div>
      <div class="modal-foot">
        <button class="btn" data-action="close-modal" type="button">取消</button>
        <button class="btn btn-danger" data-action="${esc(action)}" data-param="${esc(param || '')}" type="button">确认</button>
      </div>`);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function handleAnswerInput(t) {
    if (!session || session.phase !== 'exam') return;
    const qid = t.dataset.qid;
    const kind = t.dataset.kind;
    const q = qById(qid);
    if (!q) return;
    let val = '';
    if (kind === 'radio') {
      val = t.value;
      syncOptionUI(qid, 'radio');
    } else if (kind === 'checkbox') {
      val = $$('input[name="ans_' + qid + '"]:checked').map((x) => x.value).sort().join('');
      syncOptionUI(qid, 'checkbox');
    } else {
      val = t.value;
    }
    session.answers[qid] = val;
    const btn = document.querySelector('[data-action="palette-q"][data-index="' + session.idx + '"]');
    if (btn) btn.classList.add('done');
  }

  function syncOptionUI(qid, kind) {
    const options = $$('.option');
    options.forEach((o) => {
      const input = o.querySelector('input');
      if (!input || input.name !== 'ans_' + qid) return;
      o.classList.toggle('selected', input.checked);
    });
  }

  async function handleAction(btn) {
    const action = btn.dataset.action;
    if (action === 'toggle-upload') {
      showUpload = !showUpload;
      uploadParsed = null;
      render();
    } else if (action === 'pick-bank-file') {
      $('#uploadFile').click();
    } else if (action === 'download-template') {
      downloadTemplate(btn.dataset.format);
    } else if (action === 'add-question') {
      openQuestionModal();
    } else if (action === 'edit-question') {
      openQuestionModal(btn.dataset.qid);
    } else if (action === 'rename-bank') {
      openRenameBankModal(btn.dataset.bankid);
    } else if (action === 'rename-bank-confirm') {
      const bank = state.banks.find((b) => b.id === btn.dataset.param);
      if (bank) {
        const name = ($('#renameBankInput') ? $('#renameBankInput').value.trim() : '');
        if (!name) return toast('题库名称不能为空');
        bank.name = name;
        saveData();
        closeModal();
        toast('题库已重命名');
        render();
      }
    } else if (action === 'delete-bank') {
      confirmModal('删除题库模块', '将隐藏该题库模块及其全部题目（数据仍保存在云端，可在「已删除的题库」中随时恢复）。试卷中引用的题目也会被移除。确定删除吗？', 'delete-bank-confirm', btn.dataset.bankid);
    } else if (action === 'delete-bank-confirm') {
      const bankId = btn.dataset.param;
      const doDeleteLocal = function() {
        state.bank = state.bank.filter((q) => q.bankId !== bankId);
        (state.wrongBooks || []).forEach(function(wb) {
          wb.entries = (wb.entries || []).filter(function(w) {
            var q = qById(w.qid);
            return !q || q.bankId !== bankId;
          });
        });
        state.papers.forEach((p) => {
          p.qids = (p.qids || []).filter((x) => {
            const q = qById(x);
            return !q || q.bankId !== bankId;
          });
        });
        state.banks = state.banks.filter((b) => b.id !== bankId);
        if (imgBankIds.has(bankId)) { idbDeleteBank(bankId).catch(function () {}); imgBankIds.delete(bankId); }
        if (bankFilter.bank === bankId) bankFilter.bank = 'all';
        if (group.bank === bankId) group.bank = 'all';
        if (group.listBank === bankId) group.listBank = 'all';
        saveData();
        closeModal();
        toast('题库已删除');
        render();
      };
      if (auth.active) {
        API.deleteBank(auth.token, bankId).then(function() {
          doDeleteLocal();
        }).catch(function(e) {
          toast('服务器删除失败：' + ((e && e.message) || e) + '，已从本地移除');
          doDeleteLocal();
        });
      } else {
        doDeleteLocal();
      }
      toast('题库模块已删除');
      render();
    } else if (action === 'restore-bank') {
      const bankId = btn.dataset.bankid;
      API.restoreBank(auth.token, bankId).then(function () {
        toast('题库已恢复');
        loadBankFromServer();
      }).catch(function (e) {
        toast('恢复失败：' + ((e && e.message) || e));
      });
    } else if (action === 'delete-question') {
      confirmModal('删除题目', '删除后，已组试卷和错题本中的这道题将失效。确定删除吗？', 'delete-question-confirm', btn.dataset.qid);
    } else if (action === 'delete-question-confirm') {
      const qid = btn.dataset.param;
      if (auth.active) {
        apiDeleteQuestion(qid).then(function () {
          state.bank = state.bank.filter((q) => q.id !== qid);
          (state.wrongBooks || []).forEach(function(wb) {
            wb.entries = (wb.entries || []).filter(function(w) { return w.qid !== qid; });
          });
          state.papers.forEach((p) => { p.qids = (p.qids || []).filter((x) => x !== qid); });
          closeModal(); toast('题目已删除'); render();
        }).catch(function (e) { toast('删除失败：' + ((e && e.message) || e)); });
        return;
      }
      state.bank = state.bank.filter((q) => q.id !== qid);
      (state.wrongBooks || []).forEach(function(wb) {
        wb.entries = (wb.entries || []).filter(function(w) { return w.qid !== qid; });
      });
      state.papers.forEach((p) => {
        p.qids = (p.qids || []).filter((x) => x !== qid);
      });
      const dq = state.bank.find((x) => x.id === qid);
      if (dq && imgBankIds.has(dq.bankId)) syncImgBankDeleteQuestion(dq.bankId, qid);
      saveData();
      closeModal();
      toast('题目已删除');
      render();
    } else if (action === 'merge-bank') {
      mergeBank(btn.dataset.mode);
    } else if (action === 'cancel-upload') {
      uploadParsed = null;
      render();
    } else if (action === 'auto-pick') {
      autoPick();
    } else if (action === 'add-one') {
      addOne(btn.dataset.qid);
    } else if (action === 'add-selected') {
      addSelected();
    } else if (action === 'remove-sel') {
      removeSel(Number(btn.dataset.index));
    } else if (action === 'move-sel') {
      moveSel(Number(btn.dataset.index), Number(btn.dataset.dir));
    } else if (action === 'clear-sel') {
      group.sel = [];
      render();
    } else if (action === 'save-paper') {
      savePaper();
    } else if (action === 'start-paper') {
      startPaper(btn.dataset.pid);
    } else if (action === 'export-paper-pdf') {
      exportPaperPDF(btn.dataset.pid);
    } else if (action === 'delete-paper') {
      confirmModal('删除试卷', '删除试卷不会删除题库中的题目。确定删除吗？', 'delete-paper-confirm', btn.dataset.pid);
    } else if (action === 'delete-paper-confirm') {
      const pid = btn.dataset.param;
      state.papers = state.papers.filter((p) => p.id !== pid);
      state.attempts = state.attempts.filter((a) => a.paperId !== pid);
      saveData();
      closeModal();
      toast('试卷已删除');
      render();
    } else if (action === 'submit-exam') {
      if (!session) return;
      const unanswered = session.qids.filter((qid) => !hasAnswer(session.answers[qid], qById(qid) && qById(qid).type)).length;
      if (unanswered > 0) {
        confirmModal('确认交卷', '还有 ' + unanswered + ' 道题未作答，确认现在交卷吗？', 'submit-confirm');
      } else {
        gradeSession();
      }
    } else if (action === 'submit-confirm') {
      closeModal();
      gradeSession();
    } else if (action === 'prev-q') {
      if (session.idx > 0) {
        session.idx--;
        render();
      }
    } else if (action === 'next-q') {
      if (session.idx < session.qids.length - 1) {
        session.idx++;
        render();
      }
    } else if (action === 'palette-q') {
      session.idx = Number(btn.dataset.index);
      render();
    } else if (action === 'selfcheck') {
      selfCheck(btn.dataset.qid, btn.dataset.correct === 'true');
    } else if (action === 'master-and-exit') {
      markMastered(btn.dataset.qid);
      stopTimer();
      session = null;
      view = 'wrong';
      render();
    } else if (action === 'exit-session') {
      endSession();
    } else if (action === 'retry-session') {
      if (session) {
        session.answers = {};
        session.graded = {};
        session.score = 0;
        session.wrongIds = [];
        session.attemptId = null;
        session.endAt = null;
        session.idx = 0;
        session.phase = 'exam';
      }
      render();
    } else if (action === 'redo-wrong') {
      redoWrong(btn.dataset.qid);
    } else if (action === 'mark-master') {
      markMastered(btn.dataset.qid);
    } else if (action === 'unmaster') {
      unmaster(btn.dataset.qid);
    } else if (action === 'remove-wrong') {
      confirmModal('移出错题', '仅从错题本移除，题目仍保留在题库中。确定吗？', 'remove-wrong-confirm', btn.dataset.qid);
    } else if (action === 'remove-wrong-confirm') {
      removeWrong(btn.dataset.param);
      closeModal();
    } else if (action === 'export-data') {
      exportData();
    } else if (action === 'export-wrong-pdf') {
      exportWrongPDF();
    } else if (action === 'import-data') {
      $('#importFile').click();
    } else if (action === 'reset-data') {
      confirmModal('恢复示例数据', '当前本地数据会被示例内容覆盖，且不可撤销。建议先导出备份。确定继续吗？', 'reset-confirm');
    } else if (action === 'reset-confirm') {
      state = makeDefaultData();
      saveData();
      closeModal();
      group.sel = [];
      endSession();
      toast('已恢复示例数据');
      view = 'overview';
      render();
    } else if (action === 'save-question') {
      saveQuestion(btn.dataset.qid || '');
    } else if (action === 'logout') {
      doLogout();
    } else if (action === 'open-reset') {
      openResetModal();
    } else if (action === 'bind-phone') {
      openBindPhone(false);
    } else if (action === 'reset-get-code') {
      handleResetGetCode();
    } else if (action === 'reset-submit') {
      handleResetSubmit();
    } else if (action === 'bind-get-code') {
      handleBindGetCode();
    } else if (action === 'bind-submit') {
      handleBindSubmit();
    } else if (action === 'bind-skip') {
      closeModal();
    } else if (action === 'show-login') {
      var lp = document.getElementById('loginPage');
      var aw = document.getElementById('appWrap');
      if (lp) lp.style.display = '';
      if (aw) aw.style.display = 'none';
      var u = document.getElementById('loginUser');
      if (u) u.focus();
    } else if (action === 'admin-view-user') {
      renderAdminUserBank(btn.dataset.uid);
    } else if (action === 'admin-back') {
      view = 'admin';
      render();
    } else if (action === 'admin-delete-user') {
      var delUid = btn.dataset.uid;
      var delUname = btn.dataset.uname;
      if (confirm('确定要删除用户「' + delUname + '」吗？\n该用户的所有数据（题库、错题本）将被永久删除且无法恢复。')) {
        try {
          var dr = await API.deleteUser(auth.token, delUid);
          toast('已删除用户：' + dr.deleted);
          renderAdmin(document.getElementById('content'));
        } catch (e) {
          toast('删除失败：' + ((e && e.message) || e));
        }
      }
    } else if (action === 'close-modal') {
      closeModal();
    // ── 错题本管理 ──
    } else if (action === 'switch-wrong-book') {
      state.activeWrongBookId = btn.dataset.wbid;
      saveData();
      render();
    } else if (action === 'new-wrong-book') {
      openModal('\n        <div class="modal-head"><h2 class="modal-title">新建错题本</h2></div>\n        <div class="modal-body">\n          <div class="field">\n            <label class="field-label">错题本名称</label>\n            <input class="input" id="newWrongBookInput" type="text" placeholder="例：高数易错题、线代错题集" autofocus>\n          </div>\n        </div>\n        <div class="modal-foot">\n          <button class="btn" data-action="close-modal" type="button">取消</button>\n          <button class="btn btn-primary" data-action="create-wrong-book-confirm" type="button">创建</button>\n        </div>');
    } else if (action === 'create-wrong-book-confirm') {
      var input = document.getElementById('newWrongBookInput');
      var name = input ? input.value.trim() : '';
      if (!name) { toast('名称不能为空'); return; }
      createWrongBook(name);
      closeModal();
      toast('错题本「' + name + '」已创建');
      render();
    } else if (action === 'delete-wrong-book') {
      var wbId = btn.dataset.wbid;
      if ((state.wrongBooks || []).length <= 1) { toast('至少保留一个错题本'); return; }
      confirmModal('删除错题本', '删除后其中的错题将无法恢复。确定删除吗？', 'delete-wrong-book-confirm', wbId);
    } else if (action === 'delete-wrong-book-confirm') {
      deleteWrongBook(btn.dataset.param);
      closeModal();
    } else if (action === 'rename-wrong-book') {
      var wbId2 = btn.dataset.wbid;
      var wb2 = state.wrongBooks.find(function(b) { return b.id === wbId2; });
      if (!wb2) return;
      openModal('\n        <div class="modal-head"><h2 class="modal-title">重命名错题本</h2></div>\n        <div class="modal-body">\n          <div class="field">\n            <label class="field-label">新名称</label>\n            <input class="input" id="renameWrongBookInput" type="text" value="' + esc(wb2.name) + '" autofocus>\n          </div>\n        </div>\n        <div class="modal-foot">\n          <button class="btn" data-action="close-modal" type="button">取消</button>\n          <button class="btn btn-primary" data-action="rename-wrong-book-confirm" data-wbid="' + esc(wbId2) + '" type="button">确认</button>\n        </div>');
    } else if (action === 'rename-wrong-book-confirm') {
      var input2 = document.getElementById('renameWrongBookInput');
      var name2 = input2 ? input2.value.trim() : '';
      if (!name2) { toast('名称不能为空'); return; }
      renameWrongBook(btn.dataset.wbid, name2);
      closeModal();
    // ── 加入错题本（单题/批量） ──
    } else if (action === 'add-to-wrong-book') {
      addQidToWrongBook(btn.dataset.qid, btn.dataset.wbid);
      closeModal();
      toast('已加入错题本');
      render();
    } else if (action === 'batch-add-to-wrong-book') {
      var qids = parseQids(btn.dataset.qids);
      qids.forEach(function(qid) { addQidToWrongBook(qid, btn.dataset.wbid); });
      bankSelection = {};
      closeModal();
      toast('已将 ' + qids.length + ' 题加入错题本');
      render();
    } else if (action === 'new-wrong-book-and-add') {
      createWrongBook('新建错题本');
      addQidToWrongBook(btn.dataset.qid, state.activeWrongBookId);
      closeModal();
      toast('已加入错题本');
      render();
    } else if (action === 'new-wrong-book-and-batch-add') {
      createWrongBook('新建错题本');
      var qids2 = parseQids(btn.dataset.qids);
      qids2.forEach(function(qid) { addQidToWrongBook(qid, state.activeWrongBookId); });
      bankSelection = {};
      closeModal();
      toast('已将 ' + qids2.length + ' 题加入错题本');
      render();
    // ── 题库管理选择 ──
    } else if (action === 'bank-select-all') {
      var list = filterBank();
      var allChecked = list.length > 0 && list.every(function(q) { return bankSelection[q.id]; });
      if (allChecked) {
        list.forEach(function(q) { bankSelection[q.id] = false; });
      } else {
        list.forEach(function(q) { bankSelection[q.id] = true; });
      }
      renderBankList();
    } else if (action === 'bank-select-one') {
      bankSelection[btn.dataset.qid] = btn.checked;
      renderBankList();
    } else if (action === 'add-selected-to-wrong-book') {
      var selQids = Object.keys(bankSelection).filter(function(k) { return bankSelection[k]; });
      if (!selQids.length) { toast('请先选择题目'); return; }
      openBatchWrongBookPicker(selQids);
    } else if (action === 'add-to-wrong-from-bank') {
      openWrongBookPicker(btn.dataset.qid);
    } else if (action === 'clear-bank-selection') {
      bankSelection = {};
      render();
    } else if (action === 'page') {
      bankFilter.page = Number(btn.dataset.page);
      renderBankList();
    } else if (action === 'quick-upload') {
      uploadZoneReset();
      view = 'bank';
      showUpload = true;
      render();
    } else if (action === 'quick-group') {
      view = 'group';
      render();
    } else if (action === 'go-practice') {
      view = 'practice';
      render();
    } else if (action === 'toggle-qcard') {
      var qid = btn.dataset.qid;
      browseFilter.expanded[qid] = !browseFilter.expanded[qid];
      var card = btn.closest('.qcard');
      if (card) {
        card.classList.toggle('expanded');
        var stem = card.querySelector('.qcard-stem');
        if (stem) stem.classList.toggle('collapsed');
        typesetMath(card);
      }
    } else if (action === 'add-wrong') {
      // 刷题页面：弹出选择错题本弹窗
      openWrongBookPicker(btn.dataset.qid);
    } else if (action === 'browse-practice') {
      var qid3 = btn.dataset.qid;
      var q = qById(qid3);
      if (q) {
        if (!topTimer.running) startTopTimer();
        browseFilter.expanded[qid3] = true;
        render();
      }
    } else if (action === 'browse-type-cycle') {
      var types2 = ['all', 'single', 'multiple', 'fill', 'solve'];
      var idx2 = types2.indexOf(browseFilter.type);
      browseFilter.type = types2[(idx2 + 1) % types2.length];
      browseFilter.page = 0;
      render();
    } else if (action === 'browse-page') {
      browseFilter.page = Number(btn.dataset.page);
      render();
    } else if (action === 'toggle-timer') {
      if (topTimer.running) stopTopTimer();
      else startTopTimer();
    }
  }

  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      view = navBtn.dataset.nav;
      render();
      return;
    }
    var chapItem = e.target.closest('[data-chap]');
    if (chapItem) {
      browseFilter.chapter = chapItem.dataset.chap;
      browseFilter.expanded = {};
      browseFilter.page = 0;
      render();
      return;
    }
    var typeNavItem = e.target.closest('[data-type-nav]');
    if (typeNavItem) {
      browseFilter.type = typeNavItem.dataset.typeNav;
      browseFilter.expanded = {};
      browseFilter.page = 0;
      render();
      return;
    }
    var sidebarTab = e.target.closest('[data-sidebar-mode]');
    if (sidebarTab) {
      sidebarMode = sidebarTab.dataset.sidebarMode;
      var allTabs = document.querySelectorAll('.sidebar-tab');
      allTabs.forEach(function(tab) {
        tab.classList.toggle('active', tab === sidebarTab);
      });
      renderChapterNav();
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      handleAction(actionBtn);
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-browse-q]')) {
      browseFilter.q = t.value;
      browseFilter.page = 0;
      var cards = document.querySelectorAll('.qcard');
      // re-render the list but preserve search focus
      renderBrowse($('#content'));
      typesetMath($('#content'));
      var newInput = document.querySelector('[data-browse-q]');
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(t.value.length, t.value.length);
      }
    } else if (t.matches('[data-bank-q]')) {
      bankFilter.q = t.value;
      bankFilter.page = 0;
      renderBankList();
    } else if (t.matches('[data-group-q]')) {
      group.q = t.value;
      renderGroupList();
    } else if (t.matches('[data-group-title]')) {
      group.title = t.value;
    } else if (t.matches('[data-count-input]')) {
      group.counts[t.dataset.countInput] = Math.max(0, Number(t.value) || 0);
    } else if (t.matches('[data-score-input]')) {
      group.scores[t.dataset.scoreInput] = Math.max(1, Number(t.value) || 1);
    } else if (t.matches('[data-answer-input]')) {
      handleAnswerInput(t);
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-bank-chapter]')) {
      bankFilter.chapter = t.value;
      bankFilter.page = 0;
      renderBankList();
    } else if (t.matches('[data-bank-type]')) {
      bankFilter.type = t.value;
      bankFilter.page = 0;
      renderBankList();
    } else if (t.matches('[data-bank-diff]')) {
      bankFilter.diff = t.value;
      bankFilter.page = 0;
      renderBankList();
    } else if (t.matches('[data-bank-bank]')) {
      bankFilter.bank = t.value;
      bankFilter.page = 0;
      renderBankList();
    } else if (t.matches('[data-group-chapter]')) {
      group.chapter = t.value;
      renderGroupList();
    } else if (t.matches('[data-group-type]')) {
      group.type = t.value;
      renderGroupList();
    } else if (t.matches('[data-group-title]')) {
      group.title = t.value;
    } else if (t.matches('[data-group-duration]')) {
      group.duration = t.value;
    } else if (t.matches('[data-group-diff]')) {
      group.diff = t.value;
    } else if (t.matches('[data-group-bank]')) {
      group.bank = t.value;
    } else if (t.matches('[data-exclude-composed]')) {
      group.excludeComposed = t.checked;
      renderGroupList();
    } else if (t.matches('[data-group-listbank]')) {
      group.listBank = t.value;
      renderGroupList();
    } else if (t.matches('[data-score-input]')) {
      group.scores[t.dataset.scoreInput] = Math.max(1, Number(t.value) || 1);
    } else if (t.matches('[data-chapter-chip]')) {
      const chip = t.closest('.chip');
      if (t.checked) group.chapters.add(t.value);
      else group.chapters.delete(t.value);
      if (chip) chip.classList.toggle('checked', t.checked);
    } else if (t.matches('[data-count-input]')) {
      group.counts[t.dataset.countInput] = Math.max(0, Number(t.value) || 0);
    } else if (t.matches('[data-sel-score]')) {
      const i = Number(t.dataset.index);
      group.sel[i].score = Math.max(1, Number(t.value) || 1);
      const total = $('#selTotal');
      if (total) total.textContent = selTotal() + ' 分';
    } else if (t.matches('[data-wrong-status]')) {
      wrongFilter.status = t.value;
      render();
    } else if (t.matches('[data-wrong-chapter]')) {
      wrongFilter.chapter = t.value;
      render();
    } else if (t.matches('[data-wrong-type]')) {
      wrongFilter.type = t.value;
      render();
    } else if (t.matches('#uploadFile')) {
      handleBankFile(t.files[0]);
      t.value = '';
    } else if (t.matches('#importFile')) {
      importData(t.files[0]);
      t.value = '';
    } else if (t.matches('[data-answer-input]')) {
      handleAnswerInput(t);
    }
  });

  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });
  $('#btnData').addEventListener('click', () => {
    view = 'data';
    render();
  });
  $('#btnTimer').addEventListener('click', () => {
    if (topTimer.running) stopTopTimer();
    else startTopTimer();
  });
  $('#btnWrongBook').addEventListener('click', () => {
    view = 'wrong';
    render();
  });
  $('#btnSidebar').addEventListener('click', () => {
    var sb = $('#sidebar');
    if (sb) sb.classList.toggle('open');
  });

  /* ===================== 云端多用户（后端集成） ===================== */
  var API_BASE = window.API_BASE || '';
  var auth = { active: false, token: '', user: null };

  var API = {
    _req: function (method, path, body, token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return fetch(API_BASE + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) {
          return r.json().then(function (d) { if (!r.ok) throw (d && d.error) || ('HTTP ' + r.status); return d; });
        });
    },
    health: function () { return this._req('GET', '/api/health').catch(function () { return null; }); },
    register: function (u, p) { return this._req('POST', '/api/register', { username: u, password: p }); },
    login: function (u, p) { return this._req('POST', '/api/login', { username: u, password: p }); },
    me: function (token) { return this._req('GET', '/api/me', null, token); },
    logout: function (token) { return this._req('POST', '/api/logout', null, token); },
    sendResetCode: function (username, phone) { return this._req('POST', '/api/auth/send-reset-code', { username: username, phone: phone }); },
    resetPassword: function (username, phone, code, newPassword) { return this._req('POST', '/api/auth/reset-password', { username: username, phone: phone, code: code, newPassword: newPassword }); },
    sendBindCode: function (token, phone) { return this._req('POST', '/api/send-bind-code', { phone: phone }, token); },
    bindPhone: function (token, phone, code) { return this._req('POST', '/api/bind-phone', { phone: phone, code: code }, token); },
    bank: function (token) { return this._req('GET', '/api/bank', null, token); },
    deleteBank: function (token, bankId) { return this._req('DELETE', '/api/bank/' + encodeURIComponent(bankId), null, token); },
    restoreBank: function (token, bankId) { return this._req('POST', '/api/bank/' + encodeURIComponent(bankId) + '/restore', null, token); },
    addQuestion: function (token, q) { return this._req('POST', '/api/questions', q, token); },
    addQuestionsBatch: function (token, arr) { return this._req('POST', '/api/questions/batch', { questions: arr }, token); },
    updateQuestion: function (token, id, q) { return this._req('PUT', '/api/questions/' + encodeURIComponent(id), q, token); },
    deleteQuestion: function (token, id) { return this._req('DELETE', '/api/questions/' + encodeURIComponent(id), null, token); },
    adminUsers: function (token) { return this._req('GET', '/api/admin/users', null, token); },
    adminUserBank: function (token, id) { return this._req('GET', '/api/admin/users/' + encodeURIComponent(id) + '/bank', null, token); },
    deleteUser: function (token, id) { return this._req('DELETE', '/api/admin/users/' + encodeURIComponent(id), null, token); },
    wrongBooks: function (token) { return this._req('GET', '/api/wrong-books', null, token); },
    createWrongBook: function (token, name) { return this._req('POST', '/api/wrong-books', { name: name }, token); },
    updateWrongBook: function (token, id, data) { return this._req('PUT', '/api/wrong-books/' + encodeURIComponent(id), data, token); },
    deleteWrongBook: function (token, id) { return this._req('DELETE', '/api/wrong-books/' + encodeURIComponent(id), null, token); }
  };

  async function loadBankFromServer() {
    const d = await API.bank(auth.token);
    state.banks = d.banks;
    state.bank = d.bank;
    state.deletedBankIds = d.deletedBankIds || [];
    state.deletedBanks = d.deletedBanks || [];
    // 云端模式：服务器是题库的唯一权威来源，不再注入本地预置题库
    // 但图片/PDF 切片题库存于本机 IndexedDB，需在重置 state.banks 后重新合并回来，否则刷新即丢失
    await loadUserBanksIntoState();
    // 加载云端错题本（合并到本地，云端优先）
    try {
      const wbResp = await API.wrongBooks(auth.token);
      if (wbResp && Array.isArray(wbResp.wrongBooks) && wbResp.wrongBooks.length) {
        state.wrongBooks = wbResp.wrongBooks;
      }
      ensureDefaultWrongBook();
    } catch (e) {
      ensureDefaultWrongBook();
      console.warn('加载云端错题本失败，使用本地数据', e);
    }
  }

  function renderUserBadge() {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    var panel = document.getElementById('sidebarUser');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sidebarUser';
      panel.className = 'sidebar-user';
      sb.appendChild(panel);
    }
    panel.style.display = '';
    if (!auth.active || !auth.user) {
      if (state.backendOffline) {
        panel.innerHTML = '<div class="sidebar-user-row"><span class="user-greet">离线模式</span><span class="user-name">未连接云端</span></div>';
      } else {
        panel.innerHTML = '<div class="sidebar-user-row"><span class="user-greet">未登录</span><button class="user-logout" data-action="show-login" type="button">去登录</button></div>';
      }
      return;
    }
    var role = auth.user && auth.user.isAdmin ? ' <span class="badge badge-blue">管理者</span>' : '';
    var phoneRow;
    if (auth.user.phoneBound) {
      phoneRow = '<div class="sidebar-user-row"><span class="user-greet">已绑定手机</span><span class="user-phone">' + esc(auth.user.phone) + '</span></div>';
    } else {
      phoneRow = '<div class="sidebar-user-row"><span class="user-greet">未绑定手机</span><button class="user-bind" data-action="bind-phone" type="button">去绑定</button></div>';
    }
    panel.innerHTML = phoneRow +
      '<div class="sidebar-user-row">' +
      '<span class="user-greet">当前账号</span>' +
      '<span class="user-name">' + esc(auth.user ? auth.user.username : '') + '</span>' + role +
      '<button class="user-logout" data-action="logout" type="button" title="退出登录">退出</button>' +
      '</div>';
  }

  /* ===================== 登录页逻辑 ===================== */
  var loginMode = 'login';

  function initLoginPage() {
    // 粒子动画
    var particlesEl = document.getElementById('loginParticles');
    if (particlesEl) {
      var symbols = ['∫', '∑', '∞', 'π', '∂', 'Δ', '√', 'α', 'β', 'λ', 'μ', 'σ', 'ε', 'θ', 'lim', 'dx', '→', '∈', '∀', '∃'];
      for (var i = 0; i < 20; i++) {
        var span = document.createElement('span');
        span.className = 'particle';
        span.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        span.style.left = Math.random() * 100 + '%';
        span.style.bottom = -(Math.random() * 60 + 10) + 'px';
        span.style.animationDuration = (Math.random() * 8 + 10) + 's';
        span.style.animationDelay = Math.random() * 8 + 's';
        span.style.fontSize = (Math.random() * 18 + 14) + 'px';
        particlesEl.appendChild(span);
      }
    }

    // 考研倒计时（默认 2026年12月19日 周六）
    updateCountdown();
    setInterval(updateCountdown, 60000);

    // Tab 切换事件
    document.querySelectorAll('.login-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var t = this.dataset.loginTab;
        document.querySelectorAll('.login-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.loginTab === t); });
        loginMode = t;
        var submit = document.getElementById('loginSubmit');
        var hint = document.getElementById('loginHint');
        if (submit) submit.textContent = t === 'login' ? '登 录' : '注册并进入';
        if (hint) hint.textContent = t === 'login'
          ? '还没有账号？切换到「注册」创建独立账号，题库互不影响'
          : '创建独立账号，你的题库与其他用户完全隔离';
        var err = document.getElementById('loginError');
        if (err) err.textContent = '';
      });
    });

    // 回车键提交
    var passEl = document.getElementById('loginPass');
    if (passEl) {
      passEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitLogin();
      });
    }
    var userEl = document.getElementById('loginUser');
    if (userEl) {
      userEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var p = document.getElementById('loginPass');
          if (p) p.focus();
        }
      });
    }

    // 提交按钮
    var submitBtn = document.getElementById('loginSubmit');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitLogin);
    }
  }

  function updateCountdown() {
    // 2027 考研初试：2026年12月19日（周六）
    var examDate = new Date(2026, 11, 19); // month is 0-indexed
    var now = new Date();
    var days = Math.max(0, Math.ceil((examDate - now) / (1000 * 60 * 60 * 24)));
    var el = document.getElementById('loginCdDays');
    if (el) el.textContent = days;
  }

  async function submitLogin() {
    var user = (document.getElementById('loginUser') || {}).value || '';
    var pass = (document.getElementById('loginPass') || {}).value || '';
    var errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';
    if (user.length < 2) { if (errEl) errEl.textContent = '用户名至少 2 个字符'; return; }
    if (pass.length < 4) { if (errEl) errEl.textContent = '密码至少 4 位'; return; }
    var submitBtn = document.getElementById('loginSubmit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '处理中…'; }
    try {
      var r = loginMode === 'login' ? await API.login(user, pass) : await API.register(user, pass);
      auth.token = r.token; auth.user = r.user; auth.active = true;
      storageSet('ym_auth_token', r.token);
      // 隐藏登录页，显示应用
      var lp = document.getElementById('loginPage');
      var aw = document.getElementById('appWrap');
      if (lp) lp.style.display = 'none';
      if (aw) aw.style.display = '';
      await loadBankFromServer();
      renderUserBadge();
      render();
      toast(loginMode === 'login' ? '欢迎回来，' + r.user.username : '注册成功，已登录为 ' + r.user.username);
      if (loginMode === 'register') {
        // 注册成功后建议绑定手机号，便于日后找回密码
        setTimeout(function () { openBindPhone(true); }, 500);
      }
    } catch (e) {
      var msg = (e && (typeof e === 'string' ? e : e.message)) || '操作失败';
      if (loginMode === 'register' && /用户名已存在|already exists/i.test(msg)) {
        msg = '该用户名已注册，请点上方「登录」切换后登录';
      }
      if (errEl) errEl.textContent = msg;
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = loginMode === 'login' ? '登 录' : '注册并进入'; }
    }
  }

  function doLogout() {
    if (auth.token) { try { API.logout(auth.token); } catch (e) {} }
    auth.active = false; auth.token = ''; auth.user = null;
    storageSet('ym_auth_token', '');
    // 显示登录页，隐藏应用
    var lp = document.getElementById('loginPage');
    var aw = document.getElementById('appWrap');
    if (lp) lp.style.display = '';
    if (aw) aw.style.display = 'none';
    // 重置表单
    var u = document.getElementById('loginUser');
    var p = document.getElementById('loginPass');
    var e = document.getElementById('loginError');
    if (u) u.value = '';
    if (p) p.value = '';
    if (e) e.textContent = '';
    view = 'browse';
  }

  /* ===================== 找回密码 / 绑定手机号 ===================== */
  function startSmsCountdown(btn, seconds) {
    var left = seconds;
    btn.disabled = true;
    btn.textContent = left + ' 秒后重发';
    var timer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '获取验证码'; }
      else btn.textContent = left + ' 秒后重发';
    }, 1000);
  }

  function openResetModal() {
    openModal(
      '<div class="modal-head"><h2 class="modal-title">找回密码</h2><button class="btn btn-ghost btn-sm" data-action="close-modal" type="button">' + icon('x', 'icon-sm') + '</button></div>' +
      '<div class="modal-body auth-modal">' +
        '<p class="auth-tip">通过绑定手机号验证身份后重置密码。若账号尚未绑定手机，请先用原密码登录，在侧栏「去绑定」完成绑定。</p>' +
        '<div class="login-field"><label class="login-label">用户名</label><input class="login-input" id="resetUser" type="text" placeholder="请输入用户名" autocomplete="username"></div>' +
        '<div class="login-field"><label class="login-label">手机号</label><input class="login-input" id="resetPhone" type="tel" placeholder="请输入绑定的手机号" autocomplete="tel" maxlength="11"></div>' +
        '<div class="login-field"><label class="login-label">短信验证码</label><div class="login-input-row"><input class="login-input" id="resetCode" type="text" placeholder="6 位验证码" inputmode="numeric" maxlength="6"><button class="btn btn-outline" id="resetGetCode" data-action="reset-get-code" type="button">获取验证码</button></div></div>' +
        '<div class="login-field"><label class="login-label">新密码</label><input class="login-input" id="resetPass" type="password" placeholder="至少 4 位" autocomplete="new-password"></div>' +
        '<div class="login-error" id="resetError"></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-action="close-modal" type="button">取消</button><button class="btn btn-primary" data-action="reset-submit" type="button">重置密码</button></div>'
    );
  }

  function openBindPhone(suggest) {
    var tip = suggest
      ? '<p class="auth-tip">建议绑定手机号：忘记密码时可通过短信验证码找回，账号更安全。</p>'
      : '<p class="auth-tip">绑定手机号后，可使用短信验证码找回密码。</p>';
    openModal(
      '<div class="modal-head"><h2 class="modal-title">绑定手机号</h2><button class="btn btn-ghost btn-sm" data-action="close-modal" type="button">' + icon('x', 'icon-sm') + '</button></div>' +
      '<div class="modal-body auth-modal">' + tip +
        '<div class="login-field"><label class="login-label">手机号</label><input class="login-input" id="bindPhone" type="tel" placeholder="请输入手机号" autocomplete="tel" maxlength="11"></div>' +
        '<div class="login-field"><label class="login-label">短信验证码</label><div class="login-input-row"><input class="login-input" id="bindCode" type="text" placeholder="6 位验证码" inputmode="numeric" maxlength="6"><button class="btn btn-outline" id="bindGetCode" data-action="bind-get-code" type="button">获取验证码</button></div></div>' +
        '<div class="login-error" id="bindError"></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn" data-action="' + (suggest ? 'bind-skip' : 'close-modal') + '" type="button">' + (suggest ? '稍后再说' : '取消') + '</button><button class="btn btn-primary" data-action="bind-submit" type="button">绑定</button></div>'
    );
  }

  async function handleResetGetCode() {
    var userEl = document.getElementById('resetUser');
    var phoneEl = document.getElementById('resetPhone');
    var err = document.getElementById('resetError');
    var user = (userEl ? userEl.value : '') || '';
    var phone = (phoneEl ? phoneEl.value : '') || '';
    if (err) err.textContent = '';
    if (user.trim().length < 2) { if (err) err.textContent = '请输入用户名'; return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { if (err) err.textContent = '手机号格式不正确'; return; }
    var btn = document.getElementById('resetGetCode');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    try {
      var r = await API.sendResetCode(user.trim(), phone);
      if (err) err.textContent = '验证码已发送' + (r.dev ? '（开发模式，验证码：' + r.code + '）' : '');
      if (btn) startSmsCountdown(btn, 60);
    } catch (e) {
      var msg = (e && (typeof e === 'string' ? e : e.message)) || '发送失败';
      if (err) err.textContent = msg;
      if (btn) { btn.disabled = false; btn.textContent = '获取验证码'; }
    }
  }

  async function handleResetSubmit() {
    var userEl = document.getElementById('resetUser');
    var phoneEl = document.getElementById('resetPhone');
    var codeEl = document.getElementById('resetCode');
    var passEl = document.getElementById('resetPass');
    var err = document.getElementById('resetError');
    var user = (userEl ? userEl.value : '') || '';
    var phone = (phoneEl ? phoneEl.value : '') || '';
    var code = (codeEl ? codeEl.value : '') || '';
    var pass = (passEl ? passEl.value : '') || '';
    if (err) err.textContent = '';
    if (pass.length < 4) { if (err) err.textContent = '新密码至少 4 位'; return; }
    if (code.length < 4) { if (err) err.textContent = '请输入验证码'; return; }
    var btn = document.querySelector('[data-action="reset-submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    try {
      await API.resetPassword(user.trim(), phone, code, pass);
      closeModal();
      toast('密码已重置，请用新密码登录');
      loginMode = 'login';
      document.querySelectorAll('.login-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.loginTab === 'login'); });
      var u = document.getElementById('loginUser'); if (u) u.value = user.trim();
      var submit = document.getElementById('loginSubmit'); if (submit) submit.textContent = '登 录';
    } catch (e) {
      var msg = (e && (typeof e === 'string' ? e : e.message)) || '操作失败';
      if (err) err.textContent = msg;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '重置密码'; }
    }
  }

  async function handleBindGetCode() {
    var phoneEl = document.getElementById('bindPhone');
    var err = document.getElementById('bindError');
    var phone = (phoneEl ? phoneEl.value : '') || '';
    if (err) err.textContent = '';
    if (!/^1[3-9]\d{9}$/.test(phone)) { if (err) err.textContent = '手机号格式不正确'; return; }
    var btn = document.getElementById('bindGetCode');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    try {
      var r = await API.sendBindCode(auth.token, phone);
      if (err) err.textContent = '验证码已发送' + (r.dev ? '（开发模式，验证码：' + r.code + '）' : '');
      if (btn) startSmsCountdown(btn, 60);
    } catch (e) {
      var msg = (e && (typeof e === 'string' ? e : e.message)) || '发送失败';
      if (err) err.textContent = msg;
      if (btn) { btn.disabled = false; btn.textContent = '获取验证码'; }
    }
  }

  async function handleBindSubmit() {
    var phoneEl = document.getElementById('bindPhone');
    var codeEl = document.getElementById('bindCode');
    var err = document.getElementById('bindError');
    var phone = (phoneEl ? phoneEl.value : '') || '';
    var code = (codeEl ? codeEl.value : '') || '';
    if (err) err.textContent = '';
    if (code.length < 4) { if (err) err.textContent = '请输入验证码'; return; }
    var btn = document.querySelector('[data-action="bind-submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    try {
      var r = await API.bindPhone(auth.token, phone, code);
      auth.user = r.user;
      closeModal();
      renderUserBadge();
      toast('手机号已绑定');
    } catch (e) {
      var msg = (e && (typeof e === 'string' ? e : e.message)) || '操作失败';
      if (err) err.textContent = msg;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '绑定'; }
    }
  }

  async function apiSaveQuestion(q, qid) {
    try {
      if (qid) {
        var existing = qById(qid);
        var isMine = existing && existing.id && existing.id.indexOf('uq_') === 0;
        if (!isMine) { toast('基础题库题目不可编辑，可删除后重新添加'); return; }
        var ru = await API.updateQuestion(auth.token, qid, q);
        var i = state.bank.findIndex(function (x) { return x.id === qid; });
        if (i >= 0) state.bank[i] = ru.question;
      } else {
        // 手动新增：补上题库名，便于云端按 bankId 重建目录
        var sel = state.banks.find((b) => b.id === (q.bankId || 'bank_total'));
        if (sel && sel.id !== 'bank_total') q.bankName = sel.name;
        var rn = await API.addQuestion(auth.token, q);
        state.bank.push(rn.question);
      }
      closeModal();
      toast('题目已保存');
      render();
    } catch (e) { toast('保存失败：' + ((e && e.message) || e)); }
  }

  function apiDeleteQuestion(qid) { return API.deleteQuestion(auth.token, qid); }

  async function renderAdmin(el) {
    if (!auth.user || !auth.user.isAdmin) { view = 'browse'; render(); return; }
    el.innerHTML = '<div class="page-head"><div><h1 class="page-title">管理后台</h1><p class="page-desc">查看各用户的题库与改动情况</p></div></div>' +
      '<div id="adminBody"><div class="empty-state">' + icon('refresh') + '<div>加载中…</div></div></div>';
    try {
      var d = await API.adminUsers(auth.token);
      var rows = (d.users || []).map(function (u) {
        var chg = (u.addedCount + u.deletedCount > 0) ? ('自增 ' + u.addedCount + ' · 隐藏 ' + u.deletedCount) : '空题库';
        var actions = '<button class="btn btn-sm" data-action="admin-view-user" data-uid="' + esc(u.id) + '" type="button">查看题库</button>';
        if (!u.isAdmin) {
          actions += ' <button class="btn btn-sm btn-danger-outline" data-action="admin-delete-user" data-uid="' + esc(u.id) + '" data-uname="' + esc(u.username) + '" type="button">删除</button>';
        }
        return '<tr><td><strong>' + esc(u.username) + '</strong>' + (u.isAdmin ? ' <span class="badge badge-blue">管理者</span>' : '') + '</td>' +
          '<td class="num">' + chg + '</td>' +
          '<td>' + actions + '</td></tr>';
      }).join('');
      var ab = document.getElementById('adminBody');
      if (ab) ab.innerHTML = '<div class="table-wrap"><table class="table" style="min-width:560px"><thead><tr><th>用户</th><th>题库改动</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    } catch (e) {
      var ab2 = document.getElementById('adminBody');
      if (ab2) ab2.innerHTML = '<div class="empty-state">加载失败：' + esc((e && e.message) || e) + '</div>';
    }
  }

  async function renderAdminUserBank(uid) {
    var content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = '<div class="page-head"><div>' +
      '<button class="btn btn-ghost btn-sm" data-action="admin-back" type="button">← 返回用户列表</button>' +
      '<h1 class="page-title">用户题库</h1><p class="page-desc">只读视图</p></div></div>' +
      '<div id="adminUserBank"><div class="empty-state">加载中…</div></div>';
    try {
      var d = await API.adminUserBank(auth.token, uid);
      var uname = d.user ? d.user.username : '';
      var rows = (d.bank || []).map(function (q) {
        return '<tr><td>' + typeBadge(q.type) + '</td><td><div class="stem stem-line">' + stemMedia(q, 'q-img q-img-thumb') + '</div></td>' +
          '<td>' + esc(q.chapter) + '</td><td>' + (q.answer ? esc(String(q.answer)) : '') + '</td></tr>';
      }).join('');
      var ub = document.getElementById('adminUserBank');
      if (ub) ub.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>题型</th><th>题干</th><th>章节</th><th>答案</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="hint">用户「' + esc(uname) + '」共 ' + (d.bank || []).length + ' 题（含基础题库与其个人增删）</div>';
    } catch (e) {
      var ub2 = document.getElementById('adminUserBank');
      if (ub2) ub2.innerHTML = '<div class="empty-state">加载失败：' + esc((e && e.message) || e) + '</div>';
    }
  }

  async function boot() {
    initLoginPage();

    // 先尝试连接后端（Render 免费实例冷启动可能首次超时，重试 3 次）
    var hasBackend = false;
    for (var i = 0; i < 3; i++) {
      try {
        var h = await API.health();
        if (h && h.multiuser) { hasBackend = true; break; }
      } catch (e) { /* 继续重试 */ }
      if (i < 2) await new Promise(function(r){ setTimeout(r, 1500); });
    }

    if (hasBackend) {
      // 云端模式：必须登录
      var t = storageGet('ym_auth_token');
      if (t) {
        try {
          var me = await API.me(t);
          auth.token = t; auth.user = me.user; auth.active = true;
          await loadBankFromServer();
          if (me.wrongBooks && Array.isArray(me.wrongBooks) && me.wrongBooks.length) {
            state.wrongBooks = me.wrongBooks;
          }
          ensureDefaultWrongBook();
          // 登录态有效，隐藏登录页显示应用
          var lp = document.getElementById('loginPage');
          var aw = document.getElementById('appWrap');
          if (lp) lp.style.display = 'none';
          if (aw) aw.style.display = '';
          renderUserBadge();
          render();
          return;
        } catch (e) { storageSet('ym_auth_token', ''); }
      }
      // 无有效 token，保持登录页显示
    } else {
      // 无后端：隐藏登录页，直接进入本地模式
      var lp = document.getElementById('loginPage');
      var aw = document.getElementById('appWrap');
      if (lp) lp.style.display = 'none';
      if (aw) aw.style.display = '';
      state.backendOffline = true;
      renderUserBadge();
      render();
    }
  }

  boot();
})();
