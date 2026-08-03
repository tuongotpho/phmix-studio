export interface Question {
  number: number;
  part: number;
  elements: any[];
  type: 'choice' | 'true_false' | 'short_answer';
  choices_info?: any;
  statements_info?: any;
  short_answer_info?: any;
  new_number?: number;
  shuffled_info?: any;
}

export interface ExamData {
  header_elements: any[];
  parts: Record<number, Question[]>;
  footer_elements: any[];
  part_headers: Record<number, any>;
  warnings?: string[];
}
