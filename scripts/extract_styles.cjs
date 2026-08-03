const fs = require('fs');

let html = fs.readFileSync('gui/index.html', 'utf-8');
let styleMap = new Map();
let counter = 1;

let newHtml = html.replace(/<([a-zA-Z0-9\-]+)([^>]*)style="([^"]+)"([^>]*)>/g, (match, tag, before, styleStr, after) => {
    const styleContent = styleStr.trim();
    if (styleContent === 'display: none;') return match; // Keep display: none inline for JS toggling
    if (styleContent === 'display: none') return match;

    let className;
    if (styleMap.has(styleContent)) {
        className = styleMap.get(styleContent);
    } else {
        className = `ex-style-${counter++}`;
        styleMap.set(styleContent, className);
    }

    // Now inject className into the tag
    let restOfTag = before + after;
    
    // Does it already have a class attribute?
    if (/class="/.test(restOfTag)) {
        restOfTag = restOfTag.replace(/class="([^"]*)"/, (m, existingClasses) => {
            return `class="${existingClasses} ${className}"`;
        });
    } else {
        restOfTag = ` class="${className}"` + restOfTag;
    }
    
    return `<${tag}${restOfTag}>`;
});

// Generate CSS
let css = '/* Extracted inline styles */\n\n';
for (const [style, className] of styleMap.entries()) {
    css += `.${className} {\n`;
    const rules = style.split(';').filter(r => r.trim());
    for (const rule of rules) {
        css += `    ${rule.trim()};\n`;
    }
    css += `}\n\n`;
}

fs.writeFileSync('gui/css/extracted.css', css);
fs.writeFileSync('gui/index.html', newHtml);
console.log('Extracted ' + styleMap.size + ' unique styles.');
