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
  assert.deepEqual(cards.map(([,slug]) => slug), ['paplovag','tuzproba','taverna','cspreborn']);
  for (const [index,[,slug,card]] of cards.entries()) {
    const logo = `merch/assets/${slug}-logo.webp`;
    assert.ok(card.includes(`src="/${logo}"`));
    assert.ok(card.includes(['Paplovag','Tűzpróba','Taverna','CSP Reborn'][index]));
    assert.equal(read(logo).subarray(8, 12).toString(),'WEBP');
    assert.match(read(`merch/${slug}/index.html`).toString(),/data-mbb-url=/);
  }
});

test('CSP Reborn uses the requested widget and is listed in the shared navigation', () => {
  const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
  const paths = ['index.html','merch/index.html', ...['paplovag','tuzproba','taverna','cspreborn'].map(s=>`merch/${s}/index.html`)];
  for (const path of paths) {
    const html = read(path);
    const matches = html.match(/<li><a href="\/merch\/cspreborn\/"(?: aria-current="page")?>CSP Reborn<\/a><\/li>/g);
    assert.equal(matches?.length, 2, path);
  }
  const csp = read('merch/cspreborn/index.html');
  assert.match(csp, /widget=dc8c8d7c0c81f5e12ad746145d869488/);
  assert.match(csp, /data-mbb-title="CSP Reborn merch katalógus"/);
  assert.equal((csp.match(/href="\/merch\/cspreborn\/" aria-current="page"/g) || []).length, 2);
});
