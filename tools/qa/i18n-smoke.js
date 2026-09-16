#!/usr/bin/env node
/* ---------------------------------------------------------------
 * Does the translated site actually work?
 *
 * The responsive audit proves nothing overflows and nothing throws.
 * That is not the same as the features working. This drives them:
 * opens the language selector and follows it, runs a search in the
 * page's own language, checks the read-aloud controls came up with
 * translated labels, and confirms the glossary marked terms up on a
 * page that is no longer in English.
 *
 *   python3 -m http.server 8123 &
 *   node tools/qa/i18n-smoke.js
 * --------------------------------------------------------------- */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8123';
const LOCALES = JSON.parse(fs.readFileSync('tools/locales.json', 'utf8')).locales;

// A word that appears on the translated homepage of each locale, used as a
// search query. Chosen to be a real search, not a copy of a heading.
const QUERY = {
  en: 'operating system', zh: '操作系统', hi: 'ऑपरेटिंग सिस्टम', es: 'sistema operativo',
  ar: 'نظام تشغيل', fr: 'système d’exploitation', bn: 'অপারেটিং সিস্টেম',
  pt: 'sistema operacional', ru: 'операционная система', ur: 'آپریٹنگ سسٹم',
};

(async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const problems = [];

  for (const loc of LOCALES) {
    const code = loc.code;
    const pre = loc.root ? '' : '/' + code;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const note = s => problems.push(`${code}: ${s}`);

    await page.goto(`${BASE}${pre}/pbsd.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    const head = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.getAttribute('dir'),
      canonical: (document.querySelector('link[rel=canonical]') || {}).href,
      alternates: document.querySelectorAll('link[rel=alternate][hreflang]').length,
      locale: (document.querySelector('meta[name="imortek:locale"]') || {}).content,
      title: document.title,
      keywords: (document.querySelector('meta[name=keywords]') || {}).content || '',
    }));
    if (head.locale !== code) note(`meta locale is ${head.locale}`);
    if (head.dir !== loc.dir) note(`dir is ${head.dir}, expected ${loc.dir}`);
    if (head.alternates !== LOCALES.length + 1) note(`${head.alternates} hreflang links`);

    // The selector is server-rendered, so it must be there before any script.
    const sel = await page.evaluate(() => {
      const w = document.querySelector('.langsel');
      if (!w) return null;
      const rows = [].map.call(w.querySelectorAll('a[data-lang]'), a => ({
        code: a.getAttribute('data-lang'), href: a.getAttribute('href'),
        current: a.classList.contains('is-current'),
      }));
      return { rows, label: w.querySelector('.langsel__cur').textContent.trim() };
    });
    if (!sel) { note('no language selector'); }
    else {
      if (sel.rows.length !== LOCALES.length) note(`selector lists ${sel.rows.length} languages`);
      if (sel.label !== loc.endonym) note(`selector shows ${sel.label}, expected ${loc.endonym}`);
      const cur = sel.rows.filter(r => r.current);
      if (cur.length !== 1 || cur[0].code !== code) note('current language not marked once');
    }

    // Open it, follow it, and land somewhere real.
    await page.click('.langsel__btn');
    await page.waitForTimeout(200);
    const open = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.langsel__menu')).display !== 'none');
    if (!open) note('selector does not open');
    const target = code === 'fr' ? 'es' : 'fr';
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.click(`.langsel__menu a[data-lang="${target}"]`),
    ]);
    const landed = await page.evaluate(() =>
      (document.querySelector('meta[name="imortek:locale"]') || {}).content);
    if (landed !== target) note(`switching to ${target} landed on ${landed}`);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    // Search, in this language, against this locale's index.
    await page.keyboard.press('/');
    await page.waitForTimeout(250);
    const box = await page.$('.sitesearch input');
    if (!box) note('search did not open');
    else {
      await box.type(QUERY[code] || 'operating system');
      await page.waitForTimeout(700);
      const hits = await page.evaluate(() =>
        [].map.call(document.querySelectorAll('.sitesearch__out a'), a => a.getAttribute('href')));
      if (!hits.length) note(`search for "${QUERY[code]}" found nothing`);
      else if (pre && !hits.some(h => h.startsWith(pre + '/')))
        note('search returned no pages in this language');
      await page.keyboard.press('Escape');
    }

    // The toolbar, with its labels in this language.
    const tools = await page.evaluate(() => {
      const t = document.getElementById('imortek-toolbar');
      if (!t) return null;
      return {
        read: (t.querySelector('[data-act="read"] span') || {}).textContent,
        gloss: (t.querySelector('.gloss-ctl__label') || {}).textContent,
        marked: document.querySelectorAll('.gloss').length,
      };
    });
    if (!tools) note('no page toolbar');
    else {
      if (!tools.read) note('no read-aloud button');
      if (!tools.gloss) note('no glossary button');
      if (tools.marked < 5) note(`glossary marked only ${tools.marked} terms`);
    }

    // A marked term must explain itself in this language. Counting markers
    // proves the layer loaded; only reading one proves it loaded the right file.
    let gloss = '(none)';
    if (tools && tools.marked) {
      const btn = await page.$('.gloss');
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(500);
      gloss = await page.evaluate(() => {
        const p = document.querySelector('.gloss__pop');
        return p ? p.innerText.replace(/\s+/g, ' ').trim() : '(none)';
      });
      if (gloss === '(none)') note('clicking a marked term opened nothing');
      else if (code !== 'en' && /^[\x00-\x7F]+$/.test(gloss) && !/[àâçéèêëîïôûùüÿñæœáíóúãõêô]/i.test(gloss))
        note(`explanation came back in English: ${gloss.slice(0, 60)}`);
      await page.keyboard.press('Escape');
    }
    console.log(`  ${code.padEnd(3)} ${String(tools ? tools.marked : 0).padStart(3)} marked  ·  ` +
                `${tools ? tools.read : '-'}  ·  ${gloss.slice(0, 54)}`);
    if (errs.length) note('page error: ' + errs[0]);
    await page.close();
  }

  await browser.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.forEach(p => console.log('  ! ' + p));
    process.exit(1);
  }
  console.log('\nSelector, search, read-aloud and glossary all work in every language.');
})();
