// Tiny DOM helpers shared by the UI modules.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

export const clock = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
