export function smartSpaceMessageToText(m) {
    if (m.content != null && String(m.content).length > 0)
        return String(m.content);
    const uiMessage = m.metadata?.uiMessage;
    const parts = uiMessage?.parts;
    if (!Array.isArray(parts))
        return '';
    const texts = [];
    for (const p of parts) {
        if (!p || typeof p !== 'object')
            continue;
        if (p.type === 'text') {
            texts.push(String(p.text ?? ''));
        }
    }
    return texts.join(' ');
}
export function smartSpaceStreamPartsToText(parts) {
    const texts = [];
    for (const p of parts) {
        if (!p || typeof p !== 'object')
            continue;
        if (p.type === 'text')
            texts.push(String(p.text ?? ''));
    }
    return texts.join('');
}
//# sourceMappingURL=utils.js.map