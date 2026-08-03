const fs = require('fs');
let code = fs.readFileSync('src/routes/exam.routes.ts', 'utf-8');

code = code.replace(/const unansweredQuestions = \[\];/g, 'const unansweredQuestions: any[] = [];');
code = code.replace(/const choices = \[\];/g, 'const choices: any[] = [];');
code = code.replace(/const statements = \[\];/g, 'const statements: any[] = [];');
code = code.replace(/const parsedQuestions = \[\];/g, 'const parsedQuestions: any[] = [];');
code = code.replace(/const items = \[\];/g, 'const items: any[] = [];');
code = code.replace(/const options = \[\];/g, 'const options: any[] = [];');
code = code.replace(/const part1List = \[\];/g, 'const part1List: any[] = [];');
code = code.replace(/const part2List = \[\];/g, 'const part2List: any[] = [];');
code = code.replace(/const part3List = \[\];/g, 'const part3List: any[] = [];');

code = code.replace(/forEach\(q =>/g, 'forEach((q: any) =>');
code = code.replace(/map\(el =>/g, 'map((el: any) =>');
code = code.replace(/map\(letter =>/g, 'map((letter: any) =>');
code = code.replace(/some\(entry =>/g, 'some((entry: any) =>');
code = code.replace(/function \(node\)/g, 'function (node: any)');

code = code.replace(/catch \(err\)/g, 'catch (err: any)');
code = code.replace(/catch \(error\)/g, 'catch (error: any)');

code = code.replace(/const all_keys = \{\};/g, 'const all_keys: any = {};');
code = code.replace(/let overrides = \{\};/g, 'let overrides: any = {};');
code = code.replace(/const tnmakerAnswers = \{\};/g, 'const tnmakerAnswers: any = {};');
code = code.replace(/const mergedPayload = \{\};/g, 'const mergedPayload: any = {};');
code = code.replace(/file\.originalname/g, 'file.originalname as string');

// Add element implicitly has any type fix for object index
code = code.replace(/items\[c.id\]/g, 'items[c.id as keyof typeof items]');
code = code.replace(/items\[choice\.id\]/g, 'items[choice.id as keyof typeof items]');

// node => node.localName => (node: any)
code = code.replace(/\(node, elements\)/g, '(node: any, elements: any)');

fs.writeFileSync('src/routes/exam.routes.ts', code);
console.log('Fixed TS code');
