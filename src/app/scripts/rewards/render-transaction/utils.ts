export function removeAllEventListeners(element: Element): Element {
  const clone = element.cloneNode(true) as Element;
  element.replaceWith(clone);
  return clone;
}
