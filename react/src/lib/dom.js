// Helpers de lectura del DOM real — SIN efectos secundarios (no aplican
// nada, solo leen). El puerto a React arranca de a poco (ver SKILL.md,
// "React: fundación en progreso"): esta es una versión simplificada de
// cssSelectorFor/labelFor del toolbar.js original (que además maneja
// clones, hosts propios excluidos, etc.) — suficiente para la fundación,
// no reemplaza esa lógica todavía.

export function cssSelectorFor(el) {
  if (!(el instanceof Element)) return '';
  if (el.id) return '#' + CSS.escape(el.id);

  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'html') {
    if (node.id) {
      parts.unshift('#' + CSS.escape(node.id));
      break;
    }
    let part = node.tagName.toLowerCase();
    let siblingIndex = 1;
    let sibling = node;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName === node.tagName) siblingIndex++;
    }
    part += ':nth-of-type(' + siblingIndex + ')';
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

export function labelFor(el) {
  if (!el) return '';
  const cls =
    el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
  return el.tagName.toLowerCase() + cls;
}

const SEMANTIC_TAGS = ['section', 'article', 'header', 'footer', 'aside', 'nav', 'main'];

export function nearestSemanticContainer(el) {
  let node = el;
  while (node && node !== document.body) {
    if (SEMANTIC_TAGS.includes(node.tagName.toLowerCase())) return node;
    node = node.parentElement;
  }
  return null;
}

export function mainClassOf(el) {
  if (!el || !el.className || typeof el.className !== 'string') return '';
  return el.className.trim().split(/\s+/)[0] || '';
}

export function getBoxModel(el) {
  const cs = getComputedStyle(el);
  return {
    margin: { top: cs.marginTop, right: cs.marginRight, bottom: cs.marginBottom, left: cs.marginLeft },
    border: {
      top: cs.borderTopWidth,
      right: cs.borderRightWidth,
      bottom: cs.borderBottomWidth,
      left: cs.borderLeftWidth,
    },
    padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
    radius: {
      topLeft: cs.borderTopLeftRadius,
      topRight: cs.borderTopRightRadius,
      bottomRight: cs.borderBottomRightRadius,
      bottomLeft: cs.borderBottomLeftRadius,
    },
    size: { width: cs.width, height: cs.height },
  };
}

export function getTypography(el) {
  const cs = getComputedStyle(el);
  return {
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    textAlign: cs.textAlign,
    textTransform: cs.textTransform,
    color: cs.color,
  };
}

export function getBackgroundAndEffects(el) {
  const cs = getComputedStyle(el);
  return {
    backgroundColor: cs.backgroundColor,
    boxShadow: cs.boxShadow,
    opacity: cs.opacity,
    overflow: cs.overflow,
    cursor: cs.cursor,
  };
}
