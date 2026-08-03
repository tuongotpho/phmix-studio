import { DOMParser } from "@xmldom/xmldom";
import { Question, ExamData } from './types.js';
import {
  getNodeText,
  getElementsByTagNameLocal,
  checkRunUnderlined,
  normalizeText
} from './xml-utils.js';

export function findChoiceStarts(p_elm: any): Record<string, number> {
  const starts: Record<string, number> = { A: -1, B: -1, C: -1, D: -1 };
  const children = Array.from(p_elm.childNodes);
  const runs: { idx: number; text: string; node: any }[] = [];
  
  children.forEach((child, idx) => {
    if ((child as any).nodeType === 1) {
      const el = child as any;
      const ln = el.localName || el.tagName.split(':').pop();
      if (ln === 'r') {
        const text = getNodeText(el).trim();
        runs.push({ idx, text, node: el });
      }
    }
  });

  let i = 0;
  while (i < runs.length) {
    const { idx, text } = runs[i];
    if (!text) {
      i++;
      continue;
    }
    for (const char of ['A', 'B', 'C', 'D'] as const) {
      if (starts[char] === -1) {
        if (new RegExp(`^${char}\\s*[\\.\\:\\)\\/]`).test(text)) {
          starts[char] = idx;
          break;
        } else if (text === char) {
          let next_text = "";
          for (let j = i + 1; j < runs.length; j++) {
            if (runs[j].text) {
              next_text = runs[j].text;
              break;
            }
          }
          if (next_text && /^\s*[\.\:\)\/]/.test(next_text)) {
            starts[char] = idx;
            break;
          }
        }
      }
    }
    i++;
  }

  const found_chars = (['A', 'B', 'C', 'D'] as const).filter(c => starts[c] !== -1);
  if (found_chars.length === 1) {
    let first_text_run_idx = -1;
    for (const r of runs) {
      if (r.text) {
        first_text_run_idx = r.idx;
        break;
      }
    }
    const char_idx = starts[found_chars[0]];
    if (char_idx !== first_text_run_idx) {
      starts[found_chars[0]] = -1;
    }
  }

  return starts;
}

/**
 * Chỉ xét gạch chân trên RUN CHỨA NHÃN (chữ cái A/B/C/D đầu phương án).
 *
 * Trước đây hàm gọi quét mọi run trong đoạn: giáo viên gạch chân một từ trong nội dung
 * để nhấn mạnh cũng bị hiểu là "đây là đáp án đúng", và vì vòng lặp không dừng lại nên
 * phương án đứng sau âm thầm ghi đè phương án đứng trước.
 *
 * Vẫn nhận đúng trường hợp gạch chân cả dòng, vì khi đó run nhãn cũng nằm trong vùng
 * được gạch chân.
 */
function isLabelRunUnderlined(labelNode: any): boolean {
  if (!labelNode || labelNode.nodeType !== 1) return false;
  return checkRunUnderlined(labelNode);
}

export function parseChoices(elements: any[]): any {
  const choiceParas: { idx: number; el: any; starts: Record<string, number>; found: string[] }[] = [];
  
  elements.forEach((el, idx) => {
    const ln = el.localName || el.tagName.split(':').pop();
    if (ln === 'p') {
      const starts = findChoiceStarts(el);
      const found = (['A', 'B', 'C', 'D'] as const).filter(c => starts[c] !== -1);
      if (found.length > 0) {
        choiceParas.push({ idx, el, starts, found });
      }
    }
  });

  if (choiceParas.length === 0) {
    return null;
  }

  const options: any = {};
  // Danh sách phương án được đánh dấu là đáp án. Nhiều hơn 1 nghĩa là đề mơ hồ.
  const marked_answers: string[] = [];
  let layout: 'single_para' | 'four_paras' | 'two_paras' | null = null;

  if (choiceParas.length === 4 && choiceParas.every(p => p.found.length === 1)) {
    layout = "four_paras";
    choiceParas.forEach(p_info => {
      const char = p_info.found[0];
      const para = p_info.el;
      if (isLabelRunUnderlined(para.childNodes[p_info.starts[char]])) {
        marked_answers.push(char);
      }
      options[char] = para;
    });
  } else if (choiceParas.length === 1 && choiceParas[0].found.length === 4) {
    layout = "single_para";
    const { el: para, starts } = choiceParas[0];
    const children = Array.from(para.childNodes);
    options['pPr'] = children.slice(0, starts['A']);
    options['A'] = children.slice(starts['A'], starts['B']);
    options['B'] = children.slice(starts['B'], starts['C']);
    options['C'] = children.slice(starts['C'], starts['D']);
    options['D'] = children.slice(starts['D']);

    for (const char of ['A', 'B', 'C', 'D'] as const) {
      // options[char] là dãy node bắt đầu ĐÚNG tại run chứa nhãn (xem findChoiceStarts).
      if (isLabelRunUnderlined(options[char]?.[0])) {
        marked_answers.push(char);
      }
    }
  } else if (choiceParas.length === 2 && choiceParas[0].found.length === 2 && choiceParas[1].found.length === 2) {
    layout = "two_paras";
    const p1_info = choiceParas[0];
    const p2_info = choiceParas[1];

    const children1 = Array.from(p1_info.el.childNodes);
    options['pPr1'] = children1.slice(0, p1_info.starts['A']);
    options['A'] = children1.slice(p1_info.starts['A'], p1_info.starts['B']);
    options['B'] = children1.slice(p1_info.starts['B']);

    const children2 = Array.from(p2_info.el.childNodes);
    options['pPr2'] = children2.slice(0, p2_info.starts['C']);
    options['C'] = children2.slice(p2_info.starts['C'], p2_info.starts['D']);
    options['D'] = children2.slice(p2_info.starts['D']);

    for (const char of ['A', 'B', 'C', 'D'] as const) {
      // options[char] là dãy node bắt đầu ĐÚNG tại run chứa nhãn (xem findChoiceStarts).
      if (isLabelRunUnderlined(options[char]?.[0])) {
        marked_answers.push(char);
      }
    }
  }

  if (!layout) {
    return null;
  }

  // Chỉ chốt đáp án khi có ĐÚNG một phương án được đánh dấu. Nhiều hơn một nghĩa là
  // đề mơ hồ: trả null kèm marked_answers để parseExam cảnh báo, người dùng tự xác
  // nhận qua answer_overrides. Im lặng chọn phương án cuối là lựa chọn tệ nhất.
  const correct_answer: string | null = marked_answers.length === 1 ? marked_answers[0] : null;

  return {
    layout,
    options,
    correct_answer,
    marked_answers,
    para_indices: choiceParas.map(p => p.idx)
  };
}

export function findStatementLabel(text: string): string | null {
  const norm = normalizeText(text);
  const match = norm.match(/^([a-d])[\)\.]/i);
  if (match) {
    return match[1].toLowerCase();
  }
  return null;
}

export function parseStatements(elements: any[]): any {
  const statementParas: { idx: number; el: any; label: string }[] = [];
  elements.forEach((el, idx) => {
    const ln = el.localName || el.tagName.split(':').pop();
    if (ln === 'p') {
      const text = getNodeText(el);
      const label = findStatementLabel(text);
      if (label) {
        statementParas.push({ idx, el, label });
      }
    }
  });

  if (statementParas.length === 4) {
    const statements: Record<string, any> = {};
    const correct_answers: Record<string, boolean> = {};

    statementParas.forEach(({ el, label }) => {
      let isCorrect = false;
      const runs = getElementsByTagNameLocal(el, 'r');
      for (const r of runs) {
        const textNodes = getElementsByTagNameLocal(r, 't');
        const hasText = textNodes.some(t => (t.textContent || '').trim().length > 0);
        if (hasText) {
          if (checkRunUnderlined(r)) {
            isCorrect = true;
          }
          break;
        } else if (checkRunUnderlined(r)) {
          isCorrect = true;
          break;
        }
      }
      correct_answers[label] = isCorrect;
      statements[label] = el;
    });

    return {
      statements,
      correct_answers,
      para_indices: statementParas.map(p => p.idx)
    };
  }
  return null;
}

export function parseShortAnswer(elements: any[]): any {
  let solution_index: number | null = null;
  let answer_index: number | null = null;
  let answer_value = "";

  elements.forEach((el, idx) => {
    const ln = el.localName || el.tagName.split(':').pop();
    if (ln === 'p') {
      const text = normalizeText(getNodeText(el));
      if (/^\s*(Lời giải|Hướng dẫn giải|HDG)\b/i.test(text)) {
        solution_index = idx;
      } else {
        const m_ans = text.match(/^\s*(Đáp án|Đáp số)\s*:\s*(.*)/i);
        if (m_ans) {
          answer_index = idx;
          answer_value = m_ans[2].trim();
        }
      }
    }
  });

  return {
    solution_index,
    answer_index,
    answer_value
  };
}

export function parseExam(xmlText: string, overrides: Record<string, any> = {}): ExamData {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const bodyEl = doc.getElementsByTagName('w:body')[0] || doc.getElementsByTagName('body')[0];
  if (!bodyEl) throw new Error("Could not find body element in Word XML document.");

  const children = Array.from(bodyEl.childNodes);

  const blocks: any[] = [];
  children.forEach(child => {
    if ((child as any).nodeType === 1) {
      const el = child as any;
      const ln = el.localName || el.tagName.split(':').pop();
      if (ln === 'p' || ln === 'tbl') {
        blocks.push(el);
      }
    }
  });

  const parts: Record<number, Question[]> = { 1: [], 2: [], 3: [] };
  const part_headers: Record<number, any> = {};
  let current_part: number | null = null;
  let current_question: Question | null = null;
  const header_elements: any[] = [];
  const footer_elements: any[] = [];
  let first_part_seen = false;
  let exam_ended = false;

  blocks.forEach(block => {
    const ln = block.localName || block.tagName.split(':').pop();
    if (ln === 'p') {
      const text = getNodeText(block);
      const normText = normalizeText(text);

      if (exam_ended) {
        footer_elements.push(block);
        return;
      }

      const isEndLabel = first_part_seen &&
        normText.length < 40 &&
        !/^(Câu|Cau)\s+\d+/i.test(normText) &&
        /^[-_*\s~=|]*([Hh][ẾếÉéEe][Tt]|[Kk][ẾếEe][Tt]\s+[Tt][Hh][ÚúUu][Cc]|[Tt][Hh][Ee]\s+[Ee][Nn][Dd])[-_*\s~=|]*\.?[-_*\s~=|]*$/.test(normText);
      if (isEndLabel) {
        if (current_question) {
          parts[(current_question as any).part].push(current_question);
          current_question = null;
        }
        footer_elements.push(block);
        exam_ended = true;
        return;
      }

      const partMatch = normText.toUpperCase().match(/PHẦN\s+(I|II|III)\b/);
      if (partMatch) {
        const partStr = partMatch[1];
        const partMap: Record<string, number> = { "I": 1, "II": 2, "III": 3 };
        current_part = partMap[partStr];
        first_part_seen = true;

        part_headers[current_part] = block;

        if (current_question) {
          parts[(current_question as any).part].push(current_question);
          current_question = null;
        }
        return;
      }

      if (!first_part_seen) {
        header_elements.push(block);
        return;
      }

      const qMatch = normText.match(/^Câu\s+(\d+)[\.:\)]/i);
      if (qMatch) {
        if (current_question) {
          parts[(current_question as any).part].push(current_question);
        }

        const qNum = parseInt(qMatch[1]) || 0;
        current_question = {
          number: qNum,
          part: current_part!,
          elements: [block],
          type: 'choice'
        };
        return;
      }
    }

    if (first_part_seen && current_question) {
      current_question.elements.push(block);
    } else if (!first_part_seen) {
      header_elements.push(block);
    } else {
      footer_elements.push(block);
    }
  });

  if (current_question) {
    parts[(current_question as any).part].push(current_question);
  }

  const warnings: string[] = [];

  [1, 2, 3].forEach(pid => {
    parts[pid].forEach(q => {
      if (pid === 1) {
        q.type = 'choice';
        const info = parseChoices(q.elements);
        if (!info) {
          warnings.push(`Câu hỏi ${q.number} (Phần I) không tìm thấy đầy đủ các lựa chọn A, B, C, D đúng định dạng (hệ thống sẽ giữ nguyên nội dung câu hỏi này).`);
        } else {
          const overrideVal = overrides[String(q.number)];
          if (overrideVal) {
            info.correct_answer = overrideVal;
          }
          if (info.correct_answer === null) {
            if (info.marked_answers && info.marked_answers.length > 1) {
              warnings.push(`Câu hỏi ${q.number} (Phần I) có ${info.marked_answers.length} phương án cùng được gạch chân (${info.marked_answers.join(', ')}). Hệ thống không tự chọn đáp án cho câu này — vui lòng chỉ định đáp án đúng.`);
            } else {
              warnings.push(`Câu hỏi ${q.number} (Phần I) chưa gạch chân chọn đáp án đúng (yêu cầu gạch chân chữ cái đầu của đáp án đúng trong tệp đề gốc, ví dụ: <u>A</u>. hoặc <u>B</u>.).`);
            }
          }
          q.choices_info = info;
        }
      } else if (pid === 2) {
        q.type = 'true_false';
        const info = parseStatements(q.elements);
        if (!info) {
          warnings.push(`Câu hỏi ${q.number} (Phần II) chưa đúng định dạng 4 mệnh đề a), b), c), d) (hệ thống sẽ giữ nguyên nội dung câu hỏi này).`);
        } else {
          const overrideVal = overrides[`p2_${q.number}`];
          if (overrideVal && typeof overrideVal === 'object') {
            info.correct_answers = {
              ...info.correct_answers,
              ...overrideVal
            };
          }
          q.statements_info = info;
        }
      } else if (pid === 3) {
        q.type = 'short_answer';
        q.short_answer_info = parseShortAnswer(q.elements);
        const overrideVal = overrides[`p3_${q.number}`];
        if (overrideVal !== undefined && overrideVal !== "") {
          if (!q.short_answer_info) {
            q.short_answer_info = {
              solution_index: null,
              answer_index: 9999,
              answer_value: String(overrideVal)
            };
          } else {
            q.short_answer_info.answer_value = String(overrideVal);
            if (q.short_answer_info.answer_index === null) {
              q.short_answer_info.answer_index = 9999;
            }
          }
        }
      }
    });
  });

  return {
    header_elements,
    parts,
    footer_elements,
    part_headers,
    warnings
  };
}
