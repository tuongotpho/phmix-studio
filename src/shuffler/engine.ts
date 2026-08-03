import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Question } from './types.js';
import { mulberry32, shuffleArray } from './rng.js';
import {
  getElementsByTagNameLocal,
  replaceLabelAndUnderline,
  isSeparatorElement,
  updateQuestionNumber,
  createFooterCodeParagraph,
  createCodeBoxTable
} from './xml-utils.js';
import {
  getUsableWidthTwips,
  separatorHasBreak,
  hasExplicitTabStops,
  columnsFromBreaks,
  applyEvenTabStops,
  createSeparatorRun
} from './tab-layout.js';

function cloneElement(el: any, doc: any): any {
  return doc.importNode(el, true);
}

export function shuffleExamData(
  parts: Record<number, Question[]>,
  code: number,
  seed: number | null,
  shuffle_questions = true,
  shuffle_choices = true,
  shuffle_statements = true
) {
  const finalSeedBase = seed !== null ? seed : Math.floor(Math.random() * 1000000);
  const finalSeed = finalSeedBase + code;
  const rng = mulberry32(finalSeed);

  const shuffled_parts: Record<number, Question[]> = { 1: [], 2: [], 3: [] };
  const key_map: Record<number, any[]> = { 1: [], 2: [], 3: [] };

  function cloneQuestion(q: Question): Question {
    return {
      number: q.number,
      part: q.part,
      elements: [...q.elements],
      type: q.type,
      choices_info: q.choices_info ? {
        ...q.choices_info,
        options: { ...q.choices_info.options },
        para_indices: q.choices_info.para_indices ? [...q.choices_info.para_indices] : []
      } : undefined,
      statements_info: q.statements_info ? {
        ...q.statements_info,
        statements: { ...q.statements_info.statements },
        correct_answers: { ...q.statements_info.correct_answers }
      } : undefined,
      short_answer_info: q.short_answer_info ? {
        ...q.short_answer_info
      } : undefined
    };
  }

  // Shuffle Part I
  const p1_shuffled = shuffle_questions 
    ? shuffleArray(parts[1].map(cloneQuestion), rng) 
    : parts[1].map(cloneQuestion);

  p1_shuffled.forEach((q, idx) => {
    const new_num = idx + 1;
    q.new_number = new_num;

    if (q.choices_info) {
      const charRng = mulberry32(finalSeed + idx * 7);
      const chars = ['A', 'B', 'C', 'D'];
      const new_order = shuffle_choices ? shuffleArray(chars, charRng) : chars;
      const old_correct = q.choices_info.correct_answer;

      let new_correct: string | null = null;
      if (old_correct) {
        for (let i = 0; i < new_order.length; i++) {
          if (new_order[i] === old_correct) {
            new_correct = chars[i];
            break;
          }
        }
      }

      q.shuffled_info = {
        new_order,
        new_correct,
        old_correct
      };

      key_map[1].push({
        old_num: q.number,
        new_num,
        answer: new_correct
      });
    } else {
      key_map[1].push({
        old_num: q.number,
        new_num,
        answer: null
      });
    }
    shuffled_parts[1].push(q);
  });

  // Shuffle Part II
  const p2_shuffled = shuffle_questions 
    ? shuffleArray(parts[2].map(cloneQuestion), rng) 
    : parts[2].map(cloneQuestion);

  p2_shuffled.forEach((q, idx) => {
    const new_num = idx + 1;
    q.new_number = new_num;

    if (q.statements_info) {
      const stateRng = mulberry32(finalSeed + 100 + idx * 7);
      const chars = ['a', 'b', 'c', 'd'];
      const new_order = shuffle_statements ? shuffleArray(chars, stateRng) : chars;
      const old_correct = q.statements_info.correct_answers;

      const new_correct: Record<string, boolean> = {};
      new_order.forEach((old_char, i) => {
        const new_label = chars[i];
        new_correct[new_label] = old_correct[old_char];
      });

      q.shuffled_info = {
        new_order,
        new_correct
      };

      key_map[2].push({
        old_num: q.number,
        new_num,
        answer: new_correct
      });
    } else {
      key_map[2].push({
        old_num: q.number,
        new_num,
        answer: null
      });
    }
    shuffled_parts[2].push(q);
  });

  // Shuffle Part III
  const p3_shuffled = shuffle_questions 
    ? shuffleArray(parts[3].map(cloneQuestion), rng) 
    : parts[3].map(cloneQuestion);

  p3_shuffled.forEach((q, idx) => {
    const new_num = idx + 1;
    q.new_number = new_num;

    const ans = q.short_answer_info ? q.short_answer_info.answer_value : '';
    key_map[3].push({
      old_num: q.number,
      new_num,
      answer: ans
    });
    shuffled_parts[3].push(q);
  });

  return { shuffled_parts, key_map };
}

export function exportShuffledXml(
  shuffled_parts: Record<number, Question[]>,
  header_elements: any[],
  footer_elements: any[],
  part_headers: Record<number, any>,
  xmlTemplateText: string | any,
  is_teacher_version: boolean,
  code?: string,
  hasFooterFiles: boolean = true
): string {
  const doc = typeof xmlTemplateText === 'string'
    ? new DOMParser().parseFromString(xmlTemplateText, 'text/xml')
    : xmlTemplateText.cloneNode(true);
  const bodyEl = doc.getElementsByTagName('w:body')[0] || doc.getElementsByTagName('body')[0];
  if (!bodyEl) throw new Error("Body element not found in XML template text.");

  let sectPr = getElementsByTagNameLocal(bodyEl, 'sectPr')[0];
  if (!sectPr) {
    const wNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    sectPr = doc.createElementNS(wNS, 'w:sectPr');
  } else {
    if (sectPr.parentNode !== bodyEl) {
      sectPr = sectPr.cloneNode(true);
    }
  }

  // Đọc trước khi dọn body: sau khi xoá hết con thì sectPr gốc không còn tra được.
  const usable_width = getUsableWidthTwips(sectPr);

  const originalChildren = Array.from(bodyEl.childNodes);
  originalChildren.forEach(child => {
    bodyEl.removeChild(child);
  });

  bodyEl.appendChild(sectPr);

  function appendNode(node: any) {
    bodyEl.insertBefore(node, sectPr);
  }

  // 1. Write headers
  header_elements.forEach(el => {
    appendNode(cloneElement(el, doc));
  });

  // 2. Write parts and questions
  let codeBoxInserted = false;
  [1, 2, 3].forEach(part_id => {
    const questions = shuffled_parts[part_id] || [];
    if (questions.length === 0) return;

    if (!codeBoxInserted && code) {
      appendNode(createCodeBoxTable(doc, code));
      codeBoxInserted = true;
    }

    if (part_headers[part_id]) {
      appendNode(cloneElement(part_headers[part_id], doc));
    }

    questions.forEach(q => {
      const cloned_elements = q.elements.map(el => cloneElement(el, doc));
      if (cloned_elements.length === 0) return;

      updateQuestionNumber(cloned_elements[0], q.new_number!);

      // Handle Choices (Part I)
      if (q.type === 'choice' && q.shuffled_info && q.choices_info) {
        const info = q.choices_info;
        const shuffled = q.shuffled_info;
        const layout = info.layout;
        const options = info.options;
        const new_order: string[] = shuffled.new_order;
        const new_correct: string = shuffled.new_correct;
        const para_indices: number[] = info.para_indices;

        if (layout === "single_para") {
          const p_elm = cloned_elements[para_indices[0]];
          
          const pChildren = Array.from(p_elm.childNodes);
          pChildren.forEach(child => {
            if ((child as any).nodeType === 1) {
              const ln = (child as any).localName || (child as any).tagName.split(':').pop();
              if (ln !== 'pPr') {
                p_elm.removeChild(child);
              }
            } else {
              p_elm.removeChild(child);
            }
          });

          const labels = ['A', 'B', 'C', 'D'];
          const clean_options: Record<string, any[]> = {};
          const original_separators: Record<string, any[]> = {};

          for (const char of ['A', 'B', 'C', 'D'] as const) {
            const seg = options[char].map((node: any) => cloneElement(node, doc));
            const opt_runs = [...seg];
            const sep_runs: any[] = [];
            while (opt_runs.length > 0) {
              const lastNode = opt_runs[opt_runs.length - 1];
              if (lastNode.nodeType === 1 && isSeparatorElement(lastNode)) {
                sep_runs.unshift(opt_runs.pop()!);
              } else {
                break;
              }
            }
            clean_options[char] = opt_runs;
            original_separators[char] = sep_runs;
          }

          // Lưới đo theo VỊ TRÍ của đề gốc, không theo phương án: sau khi trộn,
          // phương án nào rơi vào vị trí đó cũng nằm đúng ô cũ.
          const break_after = labels.map(pos_char => separatorHasBreak(original_separators[pos_char]));
          const columns = columnsFromBreaks(break_after, 4);
          // Đề gốc tự đặt mốc tab thì giữ nguyên — đó chính là cách dàn tác giả muốn.
          if (!hasExplicitTabStops(p_elm)) {
            applyEvenTabStops(p_elm, doc, columns, usable_width);
          }

          new_order.forEach((old_char, new_idx) => {
            const new_label = labels[new_idx];
            const segment = clean_options[old_char];

            replaceLabelAndUnderline(segment, old_char, new_label, is_teacher_version, new_label === new_correct, doc);

            segment.forEach(node => {
              p_elm.appendChild(node);
            });

            if (new_idx < 3) {
              p_elm.appendChild(createSeparatorRun(doc, new_idx, break_after));
            }
          });
        } else if (layout === "four_paras") {
          const new_paras: any[] = [];
          const labels = ['A', 'B', 'C', 'D'];

          new_order.forEach((old_char, new_idx) => {
            const new_label = labels[new_idx];
            const para_elm = cloneElement(options[old_char], doc);
            const runs = getElementsByTagNameLocal(para_elm, 'r');

            replaceLabelAndUnderline(runs, old_char, new_label, is_teacher_version, new_label === new_correct, doc);
            new_paras.push(para_elm);
          });

          // Gán tại chỗ theo từng chỉ số thay vì splice cả dải: số đoạn vào bằng số đoạn
          // ra, nên splice(start, end-start+1) sẽ xoá luôn mọi đoạn nằm XEN GIỮA các
          // phương án (ảnh, bảng, dòng trống) — nội dung đó biến mất khỏi đề học sinh.
          new_paras.forEach((newPara, i) => {
            cloned_elements[para_indices[i]] = newPara;
          });
        } else if (layout === "two_paras") {
          const p1_elm = cloneElement(cloned_elements[para_indices[0]], doc);
          
          const p1Children = Array.from(p1_elm.childNodes);
          p1Children.forEach(child => {
            if ((child as any).nodeType === 1) {
              const ln = (child as any).localName || (child as any).tagName.split(':').pop();
              if (ln !== 'pPr') p1_elm.removeChild(child);
            } else {
              p1_elm.removeChild(child);
            }
          });

          const clean_options: Record<string, any[]> = {};
          const original_separators: Record<string, any[]> = {};

          for (const char of ['A', 'B', 'C', 'D'] as const) {
            const seg = options[char].map((node: any) => cloneElement(node, doc));
            const opt_runs = [...seg];
            const sep_runs: any[] = [];
            while (opt_runs.length > 0) {
              const lastNode = opt_runs[opt_runs.length - 1];
              if (lastNode.nodeType === 1 && isSeparatorElement(lastNode)) {
                sep_runs.unshift(opt_runs.pop()!);
              } else {
                break;
              }
            }
            clean_options[char] = opt_runs;
            original_separators[char] = sep_runs;
          }

          // Mỗi đoạn chỉ chứa 2 phương án: đoạn 1 giữ A|B, đoạn 2 giữ C|D. Lưới đo
          // từ separator giữa cặp đầu của mỗi đoạn — chính là vị trí A và C.
          const break_p1 = [separatorHasBreak(original_separators['A'])];
          const break_p2 = [separatorHasBreak(original_separators['C'])];
          const columns_p1 = columnsFromBreaks(break_p1, 2);
          const columns_p2 = columnsFromBreaks(break_p2, 2);

          if (!hasExplicitTabStops(p1_elm)) {
            applyEvenTabStops(p1_elm, doc, columns_p1, usable_width);
          }

          [new_order[0], new_order[1]].forEach((old_char, new_idx) => {
            const new_label = ['A', 'B'][new_idx];
            const segment = clean_options[old_char];

            replaceLabelAndUnderline(segment, old_char, new_label, is_teacher_version, new_label === new_correct, doc);

            segment.forEach(node => {
              p1_elm.appendChild(node);
            });

            if (new_idx === 0) {
              p1_elm.appendChild(createSeparatorRun(doc, new_idx, break_p1));
            }
          });

          const p2_elm = cloneElement(cloned_elements[para_indices[1]], doc);
          const p2Children = Array.from(p2_elm.childNodes);
          p2Children.forEach(child => {
            if ((child as any).nodeType === 1) {
              const ln = (child as any).localName || (child as any).tagName.split(':').pop();
              if (ln !== 'pPr') p2_elm.removeChild(child);
            } else {
              p2_elm.removeChild(child);
            }
          });

          if (!hasExplicitTabStops(p2_elm)) {
            applyEvenTabStops(p2_elm, doc, columns_p2, usable_width);
          }

          [new_order[2], new_order[3]].forEach((old_char, new_idx) => {
            const new_label = ['C', 'D'][new_idx];
            const segment = clean_options[old_char];

            replaceLabelAndUnderline(segment, old_char, new_label, is_teacher_version, new_label === new_correct, doc);

            segment.forEach(node => {
              p2_elm.appendChild(node);
            });

            if (new_idx === 0) {
              p2_elm.appendChild(createSeparatorRun(doc, new_idx, break_p2));
            }
          });

          // Gán tại chỗ — xem ghi chú ở nhánh four_paras.
          cloned_elements[para_indices[0]] = p1_elm;
          cloned_elements[para_indices[1]] = p2_elm;
        }
      }

      // Handle Statements (Part II)
      else if (q.type === 'true_false' && q.shuffled_info && q.statements_info) {
        const info = q.statements_info;
        const shuffled = q.shuffled_info;
        const statements = info.statements;
        const new_order: string[] = shuffled.new_order;
        const new_correct: Record<string, boolean> = shuffled.new_correct;
        const para_indices: number[] = info.para_indices;

        const new_paras: any[] = [];
        const labels = ['a', 'b', 'c', 'd'];

        new_order.forEach((old_char, new_idx) => {
          const new_label = labels[new_idx];
          const para_elm = cloneElement(statements[old_char], doc);
          const runs = getElementsByTagNameLocal(para_elm, 'r');

          replaceLabelAndUnderline(runs, old_char, new_label, is_teacher_version, !!new_correct[new_label], doc);
          new_paras.push(para_elm);
        });

        // Gán tại chỗ — xem ghi chú ở nhánh four_paras của Phần I.
        new_paras.forEach((newPara, i) => {
          cloned_elements[para_indices[i]] = newPara;
        });
      }

      // Handle Short Answer (Part III)
      else if (q.type === 'short_answer' && q.short_answer_info) {
        const info = q.short_answer_info;
        const sol_idx = info.solution_index;
        const ans_idx = info.answer_index;

        if (!is_teacher_version) {
          if (sol_idx !== null) {
            cloned_elements.splice(sol_idx);
          } else if (ans_idx !== null) {
            cloned_elements.splice(ans_idx, 1);
          }
        }
      }

      cloned_elements.forEach(node => {
        appendNode(node);
      });
    });
  });

  // 3. Write footer elements
  footer_elements.forEach(el => {
    appendNode(cloneElement(el, doc));
  });



  if (code) {
    const wNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const rNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    
    const allSectPrs: any[] = [];
    const tags = ['w:sectPr', 'sectPr'];
    tags.forEach(tag => {
      const elms = doc.getElementsByTagName(tag);
      for (let i = 0; i < elms.length; i++) {
        if (!allSectPrs.includes(elms[i])) {
          allSectPrs.push(elms[i]);
        }
      }
    });

    allSectPrs.forEach((sPr: any) => {
      const existingRefs = Array.from(sPr.getElementsByTagName('w:footerReference') || sPr.getElementsByTagName('footerReference') || []);
      existingRefs.forEach((ref: any) => {
        sPr.removeChild(ref);
      });

      const types = ['default', 'first', 'even'];
      types.forEach(type => {
        const footerRef = doc.createElementNS(wNS, 'w:footerReference');
        footerRef.setAttributeNS(wNS, 'w:type', type);
        footerRef.setAttributeNS(rNS, 'r:id', 'rIdFooter99');
        if (sPr.firstChild) {
          sPr.insertBefore(footerRef, sPr.firstChild);
        } else {
          sPr.appendChild(footerRef);
        }
      });
    });
  }

  return new XMLSerializer().serializeToString(doc);
}
