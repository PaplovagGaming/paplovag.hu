import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Merch landing links each supplied logo to its own accessible collection', () => {
  const read = name => readFileSync(new URL('../' + name, import.meta.url));
  const page = read('merch/index.html').toString();
  assert.doesNotMatch(page, /coming soon/i);
  const nav = page.match(/<nav aria-label="Merch kollekciók">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  const cards = [...nav.matchAll(/<a class="merch-hub__card[^"]+" href="\/merch\/([^/]+)\/">([\s\S]*?)<\/a>/g)];
  assert.deepEqual(cards.map(([,slug]) => slug), ['paplovag','tuzproba','taverna']);
  for (const [index,[,slug,card]] of cards.entries()) {
    const logo = `merch/assets/${slug}-logo.webp`;
    assert.ok(card.includes(`src="/${logo}"`));
    assert.ok(card.includes(['Paplovag','Tűzpróba','Taverna'][index]));
    assert.equal(read(logo).subarray(8, 12).toString(),'WEBP');
    assert.match(read(`merch/${slug}/index.html`).toString(),/data-mbb-url=/);
  }
});
