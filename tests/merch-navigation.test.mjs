import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const script = read('js/merch-navigation.js');

test('every Merch page loads the scoped navigation assets', () => {
  for (const path of ['', 'paplovag/', 'tuzproba/', 'taverna/', 'cspreborn/']) {
    const html = read('merch/' + path + 'index.html');
    assert.match(html, /<body class="merch-page">/, path);
    assert.match(html, /merch-navigation\.css\?v=2/, path);
    assert.match(html, /merch-navigation\.js\?v=3/, path);
  }
});

test('Merch desktop header uses home-style scroll state, including history restore', () => {
  let active;
  const handlers = {};
  const window = { scrollY: 20, addEventListener(name, cb) { handlers[name] = cb; } };
  const document = {
    querySelector(selector) {
      assert.equal(selector, '.merch-page #header .header');
      return { classList: { toggle(name, state) { assert.equal(name, 'active'); active = state; } } };
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  runInNewContext(script, { document, window });
  assert.equal(active, true);
  window.scrollY = 10;
  handlers.scroll();
  assert.equal(active, false);
  window.scrollY = 11;
  handlers.scroll();
  assert.equal(active, true);
  window.scrollY = 0;
  handlers.pageshow();
  assert.equal(active, false);
});

test('shared script leaves the home page header under its existing controller', () => {
  const document = { querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} };
  const window = { addEventListener() { assert.fail('Unexpected scroll listener on home'); } };
  runInNewContext(script, { document, window });
});
