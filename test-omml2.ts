import { DOMParser } from '@xmldom/xmldom';
import { getNodeTextWithMediaAndMath } from './src/shuffler/xml-utils.js';

const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <m:oMath>
    <m:f>
      <m:fPr><m:ctrlPr/></m:fPr>
      <m:num><m:r><m:t>x</m:t></m:r></m:num>
      <m:den><m:r><m:t>y</m:t></m:r></m:den>
    </m:f>
  </m:oMath>
</w:p>`;

const doc = new DOMParser().parseFromString(xml, 'text/xml');
console.log(getNodeTextWithMediaAndMath(doc.documentElement));
