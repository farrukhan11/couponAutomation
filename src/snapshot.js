async function getVisibleInteractiveSnapshot(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-coupon-agent-id]').forEach(el => el.removeAttribute('data-coupon-agent-id'));

    const candidates = [...document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"]')];
    const visible = candidates.filter(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 1 && rect.height > 1 &&
        !el.disabled;
    });

    const elements = visible.slice(0, 350).map((el, index) => {
      const id = `e${index}`;
      el.setAttribute('data-coupon-agent-id', id);
      return {
        id,
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 180),
        type: el.getAttribute('type') || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        href: el.href || '',
        name: el.getAttribute('name') || ''
      };
    });

    return {
      url: location.href,
      title: document.title,
      elements
    };
  });
}

function locatorByAgentId(page, elementId) {
  return page.locator(`[data-coupon-agent-id="${elementId}"]`).first();
}

async function clickAgentElement(page, elementId) {
  const locator = locatorByAgentId(page, elementId);
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ timeout: 12000 });
}

async function fillAgentElement(page, elementId, value) {
  const locator = locatorByAgentId(page, elementId);
  await locator.scrollIntoViewIfNeeded();
  await locator.fill(value, { timeout: 12000 });
}

module.exports = {
  getVisibleInteractiveSnapshot,
  locatorByAgentId,
  clickAgentElement,
  fillAgentElement
};
