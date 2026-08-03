export function normalizeText(text: string | null): string {
  if (text === null) return "";
  return text.trim().normalize('NFC');
}

export function getElementsByTagNameLocal(parent: any, localName: string): any[] {
  const elements: any[] = [];
  function traverse(node: any) {
    if (node.nodeType === 1) { // Element
      const ln = node.localName || node.tagName.split(':').pop();
      if (ln === localName) {
        elements.push(node);
      }
    }
    const children = node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        traverse(children[i]);
      }
    }
  }
  traverse(parent);
  return elements;
}

export function getNodeText(node: any): string {
  const texts: string[] = [];
  const tElements = getElementsByTagNameLocal(node, 't');
  for (let i = 0; i < tElements.length; i++) {
    texts.push(tElements[i].textContent || '');
  }
  return texts.join('');
}

export function getNodeTextWithMediaAndMath(
  node: any,
  relsMap: Record<string, string> = {},
  mediaMap: Record<string, string> = {},
  isMathMode: boolean = false
): string {
  if (!node) return '';

  if (node.nodeType === 3) {
    return node.nodeValue || '';
  }

  if (node.nodeType !== 1) {
    return '';
  }

  const tag = (node.localName || node.tagName || '').split(':').pop() || '';

  if (tag === 't') {
    return node.textContent || '';
  }

  if (tag === 'br') {
    return '\n';
  }

  if (tag === 'tab') {
    return '\t';
  }

  // OMML Root
  if (tag === 'oMath') {
    const result: string[] = [];
    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      result.push(getNodeTextWithMediaAndMath(child, relsMap, mediaMap, true));
    }
    return ` \\(${result.join('')}\\) `;
  }

  if (tag === 'oMathPara') {
    const result: string[] = [];
    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      result.push(getNodeTextWithMediaAndMath(child, relsMap, mediaMap, true));
    }
    return ` \\[${result.join('')}\\] `;
  }

  // OMML Fraction: <m:f>
  if (tag === 'f') {
    let numText = '';
    let denText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'num') {
        numText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'den') {
        denText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `\\frac{${numText}}{${denText}}`;
    if (numText || denText) {
      return `(${numText || '?'}/${denText || '?'})`;
    }
  }

  // OMML Superscript: <m:sSup>
  if (tag === 'sSup') {
    let baseText = '';
    let supText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'e') {
        baseText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'sup') {
        supText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `${baseText}^{${supText}}`;
    if (baseText || supText) {
      return `${baseText}^(${supText})`;
    }
  }

  // OMML Subscript: <m:sSub>
  if (tag === 'sSub') {
    let baseText = '';
    let subText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'e') {
        baseText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'sub') {
        subText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `${baseText}_{${subText}}`;
    if (baseText || subText) {
      return `${baseText}_(${subText})`;
    }
  }

  // OMML Sub-Superscript: <m:sSubSup>
  if (tag === 'sSubSup') {
    let baseText = '';
    let subText = '';
    let supText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'e') {
        baseText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'sub') {
        subText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'sup') {
        supText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `${baseText}_{${subText}}^{${supText}}`;
    if (baseText || subText || supText) {
      return `${baseText}_(${subText})^(${supText})`;
    }
  }

  // OMML Radical (Root): <m:rad>
  if (tag === 'rad') {
    let baseText = '';
    let degText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'e') {
        baseText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'deg') {
        degText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) {
      if (degText) return `\\sqrt[${degText}]{${baseText}}`;
      return `\\sqrt{${baseText}}`;
    }
    if (baseText) {
      return `√(${baseText})`;
    }
  }

  // OMML Delimiter: <m:d>
  if (tag === 'd') {
    let begCh = '(';
    let endCh = ')';
    let eText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'dPr') {
        const prChildren = Array.from((child as any).childNodes || []);
        for (const pr of prChildren as any[]) {
          const prTag = (pr.localName || pr.tagName || '').split(':').pop();
          if (prTag === 'begCh') {
            begCh = pr.getAttribute('m:val') || pr.getAttribute('val') || begCh;
          }
          if (prTag === 'endCh') {
            endCh = pr.getAttribute('m:val') || pr.getAttribute('val') || endCh;
          }
        }
      } else if (childTag === 'e') {
        eText += getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode);
      }
    }
    if (isMathMode) {
      const escapeCh = (c: string) => (c === '{' || c === '}') ? `\\${c}` : c;
      return `\\left${escapeCh(begCh)}${eText}\\right${escapeCh(endCh)}`;
    }
  }

  // OMML Limit Lower: <m:limLow>
  if (tag === 'limLow') {
    let baseText = '';
    let limText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'e') {
        baseText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'lim') {
        limText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `\\mathop{${baseText}}_{${limText}}`;
  }

  // OMML N-ary operator: <m:nary>
  if (tag === 'nary') {
    let char = '\\int'; // default
    let subText = '';
    let supText = '';
    let eText = '';
    const children = Array.from(node.childNodes || []);
    for (const child of children as any[]) {
      const childTag = (child.localName || child.tagName || '').split(':').pop();
      if (childTag === 'naryPr') {
        const prChildren = Array.from((child as any).childNodes || []);
        for (const pr of prChildren as any[]) {
          const prTag = (pr.localName || pr.tagName || '').split(':').pop();
          if (prTag === 'chr') {
            const val = pr.getAttribute('m:val') || pr.getAttribute('val');
            if (val === '∑') char = '\\sum';
            else if (val === '∏') char = '\\prod';
            else if (val === '∫') char = '\\int';
            else if (val) char = val;
          }
        }
      } else if (childTag === 'sub') {
        subText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'sup') {
        supText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      } else if (childTag === 'e') {
        eText = getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode).trim();
      }
    }
    if (isMathMode) return `${char}_{${subText}}^{${supText}} ${eText}`;
  }

  // Image drawing / shape
  if (tag === 'drawing' || tag === 'shape' || tag === 'pict') {
    const blips = getElementsByTagNameLocal(node, 'blip');
    const imageDatas = getElementsByTagNameLocal(node, 'imagedata');
    let relId = '';
    if (blips.length > 0) {
      relId = blips[0].getAttribute('r:embed') || blips[0].getAttribute('embed') || '';
    }
    if (!relId && imageDatas.length > 0) {
      relId = imageDatas[0].getAttribute('r:id') || imageDatas[0].getAttribute('id') || '';
    }

    if (relId && relsMap[relId]) {
      const imagePath = relsMap[relId];
      if (mediaMap[imagePath]) {
        const dataUrl = mediaMap[imagePath];
        const ext = imagePath.toLowerCase().split('.').pop();
        if (ext === 'emf' || ext === 'wmf') {
          return `\n<span class="mathtype-placeholder" data-src="${dataUrl}" style="display:inline-block; padding: 2px 6px; background: #fdf2f8; border: 1px dashed #f472b6; border-radius: 4px; font-size: 12px; color: #db2777; font-weight: 500; cursor: help;" title="Công thức MathType (Sẽ hiển thị bình thường khi xuất file Word)">[Công thức MathType]</span>\n`;
        }
        return `\n<img src="${dataUrl}" class="q-inline-img" style="max-width: 100%; max-height: 250px; display: block; margin: 6px 0; border-radius: 4px;" />\n`;
      }
    }
    return ` [Hình ảnh] `;
  }

  const result: string[] = [];
  const children = Array.from(node.childNodes || []);
  for (const child of children) {
    result.push(getNodeTextWithMediaAndMath(child, relsMap, mediaMap, isMathMode));
  }

  return result.join('');
}

export function checkRunUnderlined(runEl: any): boolean {
  const rPr = getElementsByTagNameLocal(runEl, 'rPr')[0];
  if (rPr) {
    const u = getElementsByTagNameLocal(rPr, 'u')[0];
    if (u) {
      const val = u.getAttribute('w:val') || u.getAttribute('val');
      if (val !== 'none') {
        return true;
      }
    }
  }
  return false;
}

export function removeRunUnderline(runEl: any) {
  const rPr = getElementsByTagNameLocal(runEl, 'rPr')[0];
  if (rPr) {
    const u = getElementsByTagNameLocal(rPr, 'u')[0];
    if (u) {
      rPr.removeChild(u);
    }
  }
}

export function setRunUnderline(runEl: any, doc: any) {
  let rPr = getElementsByTagNameLocal(runEl, 'rPr')[0];
  if (!rPr) {
    rPr = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:rPr');
    if (runEl.firstChild) {
      runEl.insertBefore(rPr, runEl.firstChild);
    } else {
      runEl.appendChild(rPr);
    }
  }
  let u = getElementsByTagNameLocal(rPr, 'u')[0];
  if (!u) {
    u = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:u');
    rPr.appendChild(u);
  }
  u.setAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:val', 'single');
}

export function removeRunColor(runEl: any) {
  const rPr = getElementsByTagNameLocal(runEl, 'rPr')[0];
  if (rPr) {
    const color = getElementsByTagNameLocal(rPr, 'color')[0];
    if (color) {
      rPr.removeChild(color);
    }
  }
}

export function setRunColorRed(runEl: any, doc: any) {
  let rPr = getElementsByTagNameLocal(runEl, 'rPr')[0];
  if (!rPr) {
    rPr = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:rPr');
    if (runEl.firstChild) {
      runEl.insertBefore(rPr, runEl.firstChild);
    } else {
      runEl.appendChild(rPr);
    }
  }
  let color = getElementsByTagNameLocal(rPr, 'color')[0];
  if (!color) {
    color = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:color');
    rPr.appendChild(color);
  }
  color.setAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:val', 'FF0000');
}

export function removeRunFormatting(runEl: any) {
  removeRunUnderline(runEl);
  removeRunColor(runEl);
}

export function setRunTeacherFormatting(runEl: any, doc: any) {
  setRunUnderline(runEl, doc);
  setRunColorRed(runEl, doc);
}

export function replaceLabelAndUnderline(
  nodes: any[],
  old_char: string,
  new_label: string,
  is_teacher_version: boolean,
  is_correct: boolean,
  doc: any
) {
  let label_run: any = null;
  let t_elm: any = null;

  for (const r of nodes) {
    if (r.nodeType === 1) {
      const ln = r.localName || r.tagName.split(':').pop();
      if (ln === 'r') {
        const t = getElementsByTagNameLocal(r, 't')[0];
        if (t && t.textContent && new RegExp(`^\\s*${old_char}`).test(t.textContent)) {
          label_run = r;
          t_elm = t;
          break;
        }
      }
    }
  }

  if (!t_elm && nodes.length > 0) {
    for (const r of nodes) {
      if (r.nodeType === 1) {
        const ln = r.localName || r.tagName.split(':').pop();
        if (ln === 'r') {
          const t = getElementsByTagNameLocal(r, 't')[0];
          if (t && t.textContent) {
            label_run = r;
            t_elm = t;
            break;
          }
        }
      }
    }
  }

  if (t_elm) {
    t_elm.textContent = t_elm.textContent ? t_elm.textContent.replace(new RegExp(`^(\\s*)${old_char}`), `$1${new_label}`) : new_label;
    if (label_run) {
      if (!is_teacher_version) {
        removeRunFormatting(label_run);
      } else {
        if (is_correct) {
          setRunTeacherFormatting(label_run, doc);
        } else {
          removeRunFormatting(label_run);
        }
      }
    }
  }
}

export function isSeparatorElement(el: any): boolean {
  const ln = el.localName || el.tagName.split(':').pop();
  if (ln === 'tab') {
    return true;
  }
  if (ln === 'r') {
    const tElms = getElementsByTagNameLocal(el, 't');
    if (tElms.length > 0) {
      const txt = tElms.map(t => t.textContent || '').join('').trim();
      if (txt) {
        return false;
      }
    }
    const tabs = getElementsByTagNameLocal(el, 'tab');
    if (tabs.length > 0) {
      return true;
    }
    const descendants = el.getElementsByTagName('*');
    for (let i = 0; i < descendants.length; i++) {
      const child = descendants.item(i);
      if (child) {
        const tag = child.localName || child.tagName.split(':').pop();
        if (tag && ['object', 'drawing', 'pict', 'oMath', 'oMathPara', 'math', 'fldSimple', 'instrText'].includes(tag)) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
}

export function createDefaultTabRun(doc: any): any {
  const r = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
  const tab = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:tab');
  r.appendChild(tab);
  return r;
}

export function updateQuestionNumber(p_elm: any, new_num: number) {
  const children = Array.from(p_elm.childNodes);
  const runs: any[] = [];
  children.forEach(child => {
    if ((child as any).nodeType === 1) {
      const el = child as any;
      const ln = el.localName || el.tagName.split(':').pop();
      if (ln === 'r') {
        runs.push(el);
      }
    }
  });

  let textAccum = "";
  const runsToModify: any[] = [];
  for (const run of runs) {
    const runText = getNodeText(run);
    textAccum += runText;
    runsToModify.push(run);

    const match = textAccum.match(/^(\s*Câu\s+)\d+(\s*[\.\:\)\-])/i);
    if (match) {
      const prefix = match[1];
      const suffix = match[2];
      const newLabel = `${prefix}${new_num}${suffix}`;

      let targetRun: any = null;
      let targetT: any = null;
      for (const r of runsToModify) {
        const t = getElementsByTagNameLocal(r, 't')[0];
        if (t) {
          targetRun = r;
          targetT = t;
          break;
        }
      }

      if (targetT) {
        const matchStr = match[0];
        const updatedTextAccum = textAccum.replace(matchStr, newLabel);
        targetT.textContent = updatedTextAccum;
        for (const r of runsToModify) {
          if (r !== targetRun) {
            const tList = getElementsByTagNameLocal(r, 't');
            tList.forEach(t => {
              t.textContent = "";
            });
          }
        }
      }
      return;
    }
  }
}

export function createFooterCodeParagraph(doc: any, code: string): any {
  const wNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = doc.createElementNS(wNS, 'w:p');
  
  const pPr = doc.createElementNS(wNS, 'w:pPr');
  const jc = doc.createElementNS(wNS, 'w:jc');
  jc.setAttributeNS(wNS, 'w:val', 'right');
  pPr.appendChild(jc);
  p.appendChild(pPr);
  
  const r1 = doc.createElementNS(wNS, 'w:r');
  const rPr1 = doc.createElementNS(wNS, 'w:rPr');
  const rFonts1 = doc.createElementNS(wNS, 'w:rFonts');
  rFonts1.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFonts1.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFonts1.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPr1.appendChild(rFonts1);
  const sz1 = doc.createElementNS(wNS, 'w:sz');
  sz1.setAttributeNS(wNS, 'w:val', '22');
  rPr1.appendChild(sz1);
  const szCs1 = doc.createElementNS(wNS, 'w:szCs');
  szCs1.setAttributeNS(wNS, 'w:val', '22');
  rPr1.appendChild(szCs1);
  r1.appendChild(rPr1);
  const t1 = doc.createElementNS(wNS, 'w:t');
  t1.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t1.textContent = 'Trang ';
  r1.appendChild(t1);
  p.appendChild(r1);

  const fldSimple1 = doc.createElementNS(wNS, 'w:fldSimple');
  fldSimple1.setAttributeNS(wNS, 'w:instr', 'PAGE');
  
  const rPage = doc.createElementNS(wNS, 'w:r');
  const rPrPage = doc.createElementNS(wNS, 'w:rPr');
  const rFontsPage = doc.createElementNS(wNS, 'w:rFonts');
  rFontsPage.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFontsPage.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFontsPage.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPrPage.appendChild(rFontsPage);
  const szPage = doc.createElementNS(wNS, 'w:sz');
  szPage.setAttributeNS(wNS, 'w:val', '22');
  rPrPage.appendChild(szPage);
  const szCsPage = doc.createElementNS(wNS, 'w:szCs');
  szCsPage.setAttributeNS(wNS, 'w:val', '22');
  rPrPage.appendChild(szCsPage);
  rPage.appendChild(rPrPage);
  
  const tPage = doc.createElementNS(wNS, 'w:t');
  tPage.textContent = '1';
  rPage.appendChild(tPage);
  fldSimple1.appendChild(rPage);
  p.appendChild(fldSimple1);

  const r2 = doc.createElementNS(wNS, 'w:r');
  const rPr2 = doc.createElementNS(wNS, 'w:rPr');
  const rFonts2 = doc.createElementNS(wNS, 'w:rFonts');
  rFonts2.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFonts2.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFonts2.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPr2.appendChild(rFonts2);
  const sz2 = doc.createElementNS(wNS, 'w:sz');
  sz2.setAttributeNS(wNS, 'w:val', '22');
  rPr2.appendChild(sz2);
  const szCs2 = doc.createElementNS(wNS, 'w:szCs');
  szCs2.setAttributeNS(wNS, 'w:val', '22');
  rPr2.appendChild(szCs2);
  r2.appendChild(rPr2);
  const t2 = doc.createElementNS(wNS, 'w:t');
  t2.textContent = '/';
  r2.appendChild(t2);
  p.appendChild(r2);

  const fldSimple2 = doc.createElementNS(wNS, 'w:fldSimple');
  fldSimple2.setAttributeNS(wNS, 'w:instr', 'NUMPAGES');
  
  const rNumPages = doc.createElementNS(wNS, 'w:r');
  const rPrNumPages = doc.createElementNS(wNS, 'w:rPr');
  const rFontsNumPages = doc.createElementNS(wNS, 'w:rFonts');
  rFontsNumPages.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFontsNumPages.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFontsNumPages.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPrNumPages.appendChild(rFontsNumPages);
  const szNumPages = doc.createElementNS(wNS, 'w:sz');
  szNumPages.setAttributeNS(wNS, 'w:val', '22');
  rPrNumPages.appendChild(szNumPages);
  const szCsNumPages = doc.createElementNS(wNS, 'w:szCs');
  szCsNumPages.setAttributeNS(wNS, 'w:val', '22');
  rPrNumPages.appendChild(szCsNumPages);
  rNumPages.appendChild(rPrNumPages);
  
  const tNumPages = doc.createElementNS(wNS, 'w:t');
  tNumPages.textContent = '1';
  rNumPages.appendChild(tNumPages);
  fldSimple2.appendChild(rNumPages);
  p.appendChild(fldSimple2);

  const r3 = doc.createElementNS(wNS, 'w:r');
  const rPr3 = doc.createElementNS(wNS, 'w:rPr');
  const rFonts3 = doc.createElementNS(wNS, 'w:rFonts');
  rFonts3.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFonts3.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFonts3.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPr3.appendChild(rFonts3);
  const sz3 = doc.createElementNS(wNS, 'w:sz');
  sz3.setAttributeNS(wNS, 'w:val', '22');
  rPr3.appendChild(sz3);
  const szCs3 = doc.createElementNS(wNS, 'w:szCs');
  szCs3.setAttributeNS(wNS, 'w:val', '22');
  rPr3.appendChild(szCs3);
  r3.appendChild(rPr3);
  const t3 = doc.createElementNS(wNS, 'w:t');
  t3.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  t3.textContent = ' - Mã đề thi ';
  r3.appendChild(t3);
  p.appendChild(r3);

  const r4 = doc.createElementNS(wNS, 'w:r');
  const rPr4 = doc.createElementNS(wNS, 'w:rPr');
  const rFonts4 = doc.createElementNS(wNS, 'w:rFonts');
  rFonts4.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFonts4.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFonts4.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPr4.appendChild(rFonts4);
  const sz4 = doc.createElementNS(wNS, 'w:sz');
  sz4.setAttributeNS(wNS, 'w:val', '22');
  rPr4.appendChild(sz4);
  const szCs4 = doc.createElementNS(wNS, 'w:szCs');
  szCs4.setAttributeNS(wNS, 'w:val', '22');
  rPr4.appendChild(szCs4);
  const b4 = doc.createElementNS(wNS, 'w:b');
  rPr4.appendChild(b4);
  r4.appendChild(rPr4);
  const t4 = doc.createElementNS(wNS, 'w:t');
  t4.textContent = code;
  r4.appendChild(t4);
  p.appendChild(r4);

  return p;
}

export function createCodeBoxTable(doc: any, code: string): any {
  const wNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const tbl = doc.createElementNS(wNS, 'w:tbl');

  const tblPr = doc.createElementNS(wNS, 'w:tblPr');
  const tblStyle = doc.createElementNS(wNS, 'w:tblStyle');
  tblStyle.setAttributeNS(wNS, 'w:val', 'TableGrid');
  tblPr.appendChild(tblStyle);

  const tblW = doc.createElementNS(wNS, 'w:tblW');
  tblW.setAttributeNS(wNS, 'w:w', '1800');
  tblW.setAttributeNS(wNS, 'w:type', 'dxa');
  tblPr.appendChild(tblW);

  const jcTbl = doc.createElementNS(wNS, 'w:jc');
  jcTbl.setAttributeNS(wNS, 'w:val', 'right');
  tblPr.appendChild(jcTbl);

  const tblBorders = doc.createElementNS(wNS, 'w:tblBorders');
  ['top', 'left', 'bottom', 'right'].forEach(side => {
    const border = doc.createElementNS(wNS, `w:${side}`);
    border.setAttributeNS(wNS, 'w:val', 'single');
    border.setAttributeNS(wNS, 'w:sz', '6');
    border.setAttributeNS(wNS, 'w:space', '0');
    border.setAttributeNS(wNS, 'w:color', 'auto');
    tblBorders.appendChild(border);
  });
  tblPr.appendChild(tblBorders);
  tbl.appendChild(tblPr);

  const tblGrid = doc.createElementNS(wNS, 'w:tblGrid');
  const gridCol = doc.createElementNS(wNS, 'w:gridCol');
  gridCol.setAttributeNS(wNS, 'w:w', '1800');
  tblGrid.appendChild(gridCol);
  tbl.appendChild(tblGrid);

  const tr = doc.createElementNS(wNS, 'w:tr');
  const trPr = doc.createElementNS(wNS, 'w:trPr');
  const cantSplit = doc.createElementNS(wNS, 'w:cantSplit');
  trPr.appendChild(cantSplit);
  tr.appendChild(trPr);

  const tc = doc.createElementNS(wNS, 'w:tc');
  const tcPr = doc.createElementNS(wNS, 'w:tcPr');
  const tcW = doc.createElementNS(wNS, 'w:tcW');
  tcW.setAttributeNS(wNS, 'w:w', '1800');
  tcW.setAttributeNS(wNS, 'w:type', 'dxa');
  tcPr.appendChild(tcW);
  const vAlign = doc.createElementNS(wNS, 'w:vAlign');
  vAlign.setAttributeNS(wNS, 'w:val', 'center');
  tcPr.appendChild(vAlign);
  tc.appendChild(tcPr);

  const p = doc.createElementNS(wNS, 'w:p');
  const pPr = doc.createElementNS(wNS, 'w:pPr');
  const jcP = doc.createElementNS(wNS, 'w:jc');
  jcP.setAttributeNS(wNS, 'w:val', 'center');
  pPr.appendChild(jcP);
  p.appendChild(pPr);

  const r = doc.createElementNS(wNS, 'w:r');
  const rPr = doc.createElementNS(wNS, 'w:rPr');
  
  const rFonts = doc.createElementNS(wNS, 'w:rFonts');
  rFonts.setAttributeNS(wNS, 'w:ascii', 'Times New Roman');
  rFonts.setAttributeNS(wNS, 'w:hAnsi', 'Times New Roman');
  rFonts.setAttributeNS(wNS, 'w:cs', 'Times New Roman');
  rPr.appendChild(rFonts);

  const b = doc.createElementNS(wNS, 'w:b');
  rPr.appendChild(b);

  const sz = doc.createElementNS(wNS, 'w:sz');
  sz.setAttributeNS(wNS, 'w:val', '22');
  rPr.appendChild(sz);

  const szCs = doc.createElementNS(wNS, 'w:szCs');
  szCs.setAttributeNS(wNS, 'w:val', '22');
  rPr.appendChild(szCs);

  r.appendChild(rPr);

  const t = doc.createElementNS(wNS, 'w:t');
  t.textContent = `Mã đề: ${code}`;
  r.appendChild(t);
  p.appendChild(r);

  tc.appendChild(p);
  tr.appendChild(tc);
  tbl.appendChild(tr);

  return tbl;
}
