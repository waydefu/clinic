import { afterEach, expect, it, vi } from 'vitest';
import { activateFormPlaceholders } from '../public/modules/form-placeholders.js';

afterEach(() => vi.unstubAllGlobals());

it('does not copy navigation attributes into a dynamic form', () => {
  const attrs = new Map([
    ['data-follow-up-form', 'synthetic'],
    ['action', 'https://example.invalid/'],
    ['method', 'post']
  ]);
  const form = {
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
    append: vi.fn()
  };
  const placeholder = {
    hasAttribute: (name: string) => attrs.has(name),
    getAttribute: (name: string) => attrs.get(name),
    childNodes: ['synthetic-child'],
    replaceWith: vi.fn()
  };
  vi.stubGlobal('document', { createElement: () => form });
  activateFormPlaceholders({ querySelectorAll: () => [placeholder] });
  expect(form.setAttribute).toHaveBeenCalledWith(
    'data-follow-up-form',
    'synthetic'
  );
  const attributeNames = form.setAttribute.mock.calls.map((call) => call[0]);
  expect(attributeNames).toEqual(['data-follow-up-form']);
  expect(form.append).toHaveBeenCalledWith('synthetic-child');
  expect(placeholder.replaceWith).toHaveBeenCalledWith(form);
  const event = { preventDefault: vi.fn() };
  const listener = form.addEventListener.mock.calls[0][1];
  listener(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
});
