export const HIGHLIGHT_ATTRIBUTE = 'data-legendary-highlight';

const ACCENT = '#7FDBCA';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);

function textNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  root.childNodes.forEach((child) => {
    if (child.nodeType === 3) nodes.push(child as Text);
    else if (!(child as Element).hasAttribute?.(HIGHLIGHT_ATTRIBUTE))
      nodes.push(...textNodes(child));
  });
  return nodes;
}

function wrap(node: Text, start: number, length: number) {
  const target = node.splitText(start);
  target.splitText(length);
  const mark = node.ownerDocument.createElement('span');
  mark.setAttribute(HIGHLIGHT_ATTRIBUTE, '');
  // As medidas seguem o sublinhado da legenda nos frames 1a e 1b, proporcionais à fonte.
  mark.style.setProperty('text-decoration-line', 'underline');
  mark.style.setProperty('text-decoration-color', ACCENT);
  mark.style.setProperty('text-decoration-thickness', '0.09em');
  mark.style.setProperty('text-underline-offset', '0.22em');
  target.replaceWith(mark);
  mark.append(target);
}

/** Sublinha as palavras dentro da legenda. O texto da legenda nunca é tratado como HTML. */
export function applyHighlight(
  root: ParentNode,
  selector: string,
  surfaces: readonly string[],
): void {
  const containers = [...root.querySelectorAll(selector)];
  for (const surface of surfaces) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(surface)}(?![\\p{L}\\p{N}])`,
      'iu',
    );
    const found = containers
      .flatMap((container) => textNodes(container))
      .map((node) => ({ node, match: pattern.exec(node.data) }))
      .find(({ match }) => match);
    if (found?.match) wrap(found.node, found.match.index, found.match[0].length);
  }
}
