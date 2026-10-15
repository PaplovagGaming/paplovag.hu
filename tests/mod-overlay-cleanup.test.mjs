import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('MOD Center keeps draw controls while the old OBS administration is absent',()=>{
  const html=read('mod/index.html'),js=read('mod/mod.js'),css=read('mod/mod.css');
  for(const marker of ['data-view="overlay"','view-overlay','generate-overlay','test-overlay','overlay-url'])
    assert.ok(!html.includes(marker) && !js.includes(marker),marker);
  assert.ok(!css.includes('.overlay-card') && !css.includes('.overlay-preview'));
  for(const marker of ['data-view="active"','data-view="history"','data-view="audit"','winner-dialog'])
    assert.ok(html.includes(marker),marker);
  for(const marker of ['games/${state.active.id}/${action}','action === "draw" || action === "reroll"','showWinner(result.draw)'])
    assert.ok(js.includes(marker),marker);
  assert.equal(existsSync(new URL('../mod/overlay/index.html',import.meta.url)),false);
  assert.ok(!read('_redirects').includes('/mod/overlay'));
});
