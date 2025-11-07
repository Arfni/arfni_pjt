/**
 * Smoothly scrolls to a target element or position
 * @param target - Element ID (with #), element, or Y position
 * @param offset - Offset from top (default: 0)
 */
export function smoothScrollTo(
  target: string | HTMLElement | number,
  offset: number = 0
): void {
  let targetPosition: number;

  if (typeof target === 'number') {
    targetPosition = target;
  } else if (typeof target === 'string') {
    const element = document.querySelector(target);
    if (!element) {
      console.warn(`Element not found: ${target}`);
      return;
    }
    targetPosition = element.getBoundingClientRect().top + window.scrollY;
  } else {
    targetPosition = target.getBoundingClientRect().top + window.scrollY;
  }

  window.scrollTo({
    top: targetPosition - offset,
    behavior: 'smooth',
  });
}
