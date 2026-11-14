/* Interaction tests for glasshouse-room-card, run with node + jsdom (not a repo dependency):
 *   mkdir /tmp/ghtest && cd /tmp/ghtest && npm i jsdom
 *   node /path/to/repo/test/interaction.test.cjs
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd(), __dirname] }));

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.log('  ✗', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }

function setup(opts) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(`
    if (!window.PointerEvent) {
      window.PointerEvent = class PointerEvent extends MouseEvent {
        constructor(t, i) { super(t, i); this.pointerType = (i && i.pointerType) || 'mouse'; }
      };
    }
    customElements.define('ha-card', class extends HTMLElement {});
    customElements.define('ha-icon', class extends HTMLElement {});
    customElements.define('ha-state-icon', class extends HTMLElement {});
  `);
  w.console.info = () => {};
  w.eval(read('test/mock-hass.js'));
  w.eval(read('glasshouse-room-card.js'));
  const mock = w.GHMock.createHass(undefined, opts);
  const card = w.document.createElement('glasshouse-room-card');
  card.setConfig({
    name: 'Living Room', icon: 'mdi:sofa',
    temperature: 'sensor.lr_temperature', humidity: 'sensor.lr_humidity', motion: 'binary_sensor.lr_motion',
    entities: [
      'light.lr_ceiling', 'light.lr_strip', 'light.lr_floor',
      { entity: 'fan.lr_ceiling', name: 'Ceiling Fan', icon: 'mdi:ceiling-fan' },
      'cover.lr_blinds', { entity: 'switch.lr_lamp', name: 'Lamp' }, 'switch.lr_soundbar', 'switch.lr_heater',
    ],
  });
  w.document.body.append(card);
  mock.subscribe((hass) => { card.hass = hass; });
  const events = [];
  card.addEventListener('hass-more-info', (e) => events.push(['more-info', e.detail.entityId]));
  card.addEventListener('haptic', (e) => events.push(['haptic', e.detail]));
  const $ = (sel) => card.shadowRoot.querySelector(sel);
  const $$ = (sel) => [...card.shadowRoot.querySelectorAll(sel)];
  const pill = (id) => $(`.pill[data-entity="${id}"]`);
  const ptr = (el, type, x = 5, y = 5) => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  const tap = (el) => { ptr(el, 'pointerdown'); ptr(el, 'pointerup'); };
  return { w, mock, card, events, $, $$, pill, ptr, tap };
}

(async () => {
  console.log('render');
  {
    const { $, $$, pill, card } = setup();
    eq($$('.pill').length, 8, 'renders one pill per entity');
    eq(pill('light.lr_ceiling').querySelector('.st').textContent, '68%', 'dimmable light shows brightness');
    eq(pill('fan.lr_ceiling').querySelector('.st').textContent, 'Speed 2/6', 'fan shows speed step');
    eq(pill('cover.lr_blinds').querySelector('.st').textContent, 'Open 40%', 'cover shows position');
    eq(pill('switch.lr_heater').querySelector('.st').textContent, 'Unavailable', 'unavailable text');
    ok(pill('switch.lr_heater').classList.contains('unavail'), 'unavailable pill is dimmed');
    eq($('.summary').textContent, '4 on · 1 open · 71° · 42%', 'summary line');
    ok(!$('.alloff').hidden, 'all-off visible when something is on');
    ok($('.motion').classList.contains('on'), 'motion dot on');
    ok(pill('light.lr_strip').style.getPropertyValue('--accent').startsWith('rgb(138'), 'colour light uses its own colour');
    eq(pill('light.lr_ceiling').style.getPropertyValue('--accent'), 'var(--gh-light)', 'white light uses light accent');
    eq(pill('light.lr_ceiling').getAttribute('aria-pressed'), 'true', 'aria-pressed on');
    eq(card.getGridOptions(), { columns: 12, min_columns: 6, rows: 'auto' }, 'getGridOptions');
  }

  console.log('tap / double tap / keyboard / diffing');
  {
    const { mock, events, pill, tap, card, w } = setup();
    let updates = [];
    const orig = card._updatePill.bind(card);
    card._updatePill = (id) => { updates.push(id); orig(id); };
    const floorEl = pill('light.lr_floor');
    // tapping the tile body of a dimmable light opens the floating controls instead of toggling
    tap(floorEl);
    await sleep(50);
    eq(mock.calls.length, 0, 'body tap on a dimmable light does not toggle');
    ok(!!w.document.querySelector('[data-glasshouse-room-pop]'), 'body tap opens the floating controls');
    ok(!!w.document.querySelector('[data-glasshouse-room-pop]').shadowRoot.querySelector('input[type=range]'), 'popover has a slider');
    card._closePop();
    ok(!w.document.querySelector('[data-glasshouse-room-pop]'), 'popover closes');
    // tapping the icon toggles at once
    tap(floorEl.querySelector('.ic'));
    await sleep(20);
    eq(mock.calls.at(-1), { domain: 'light', service: 'toggle', data: { entity_id: 'light.lr_floor' } }, 'icon tap toggles');
    eq(updates, ['light.lr_floor'], 'only the changed pill re-rendered');
    ok(pill('light.lr_floor') === floorEl, 'pill element reused');
    eq(floorEl.querySelector('.st').textContent, '100%', 'pill reflects new state');
    ok(events.some((e) => e[0] === 'haptic' && e[1] === 'light'), 'haptic on toggle');

    updates = [];
    card.hass = mock.current;
    eq(updates.length, 0, 'same states -> no re-render');

    const n = mock.calls.length;
    tap(pill('switch.lr_lamp')); await sleep(60); tap(pill('switch.lr_lamp'));
    await sleep(320);
    eq(mock.calls.length, n, 'double tap does not toggle');
    eq(events.filter((e) => e[0] === 'more-info').at(-1), ['more-info', 'switch.lr_lamp'], 'double tap opens more-info');

    pill('switch.lr_soundbar').dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 0 }));
    eq(mock.calls.at(-1).data.entity_id, 'switch.lr_soundbar', 'keyboard activation toggles at once');

    const m = mock.calls.length;
    tap(pill('switch.lr_heater')); await sleep(320);
    eq(mock.calls.length, m, 'unavailable pill is not toggled');
  }

  console.log('hold -> control sheet, sliders');
  {
    const { mock, events, pill, ptr, $, $$, card, w } = setup({ delay: 400 });
    const el = pill('light.lr_ceiling');
    ptr(el, 'pointerdown'); await sleep(560); ptr(el, 'pointerup');
    await sleep(300);
    eq(mock.calls.length, 0, 'hold does not toggle');
    ok($('.sheet-wrap').classList.contains('open'), 'hold opens the sheet');
    eq($('.sh-name').textContent, 'Ceiling', 'sheet shows the entity');
    ok(el.classList.contains('sel'), 'selected pill marked');
    const sliders = $$('.sheet input[type=range]');
    eq(sliders.length, 2, 'brightness + colour temp sliders');
    const b = sliders[0];
    b.value = '30'; b.dispatchEvent(new w.Event('input', { bubbles: true }));
    eq(mock.calls.length, 0, 'no service call while dragging');
    eq($('.sheet .ctl-val').textContent, '30%', 'value label follows drag');
    // a state push during the drag must not move the slider
    mock.setState('light.lr_ceiling', 'on', { brightness: 200 });
    eq(b.value, '30', 'hass update does not fight the drag');
    b.dispatchEvent(new w.Event('change', { bubbles: true }));
    eq(mock.calls.at(-1), { domain: 'light', service: 'turn_on', data: { entity_id: 'light.lr_ceiling', brightness_pct: 30 } }, 'release commits brightness');
    eq(el.querySelector('.st').textContent, '30%', 'pill shows target before state catches up');
    mock.setState('light.lr_ceiling', 'on', { brightness: 255 }); // unrelated intermediate report
    eq(b.value, '30', 'slider holds target until state catches up');
    await sleep(500);
    eq(el.querySelector('.st').textContent, '30%', 'state caught up');
    const k = sliders[1];
    k.value = '4000'; k.dispatchEvent(new w.Event('input')); k.dispatchEvent(new w.Event('change'));
    eq(mock.calls.at(-1).data, { entity_id: 'light.lr_ceiling', color_temp_kelvin: 4000 }, 'colour temp commit');

    // switch to fan sheet via hold
    const fan = pill('fan.lr_ceiling');
    ptr(fan, 'pointerdown'); await sleep(560); ptr(fan, 'pointerup');
    eq($('.sh-name').textContent, 'Ceiling Fan', 'hold another pill swaps the sheet');
    const s = $('.sheet input[type=range]');
    eq([s.min, s.max, s.value], ['0', '6', '2'], 'fan slider uses percentage_step (6 speeds)');
    s.value = '4'; s.dispatchEvent(new w.Event('input')); s.dispatchEvent(new w.Event('change'));
    eq(mock.calls.at(-1), { domain: 'fan', service: 'set_percentage', data: { entity_id: 'fan.lr_ceiling', percentage: 67 } }, 'fan speed commit');
    eq(fan.querySelector('.st').textContent, 'Speed 4/6', 'fan pill shows target');
    const dir = $$('.sheet .btn').find((x) => /Forward|Reverse/.test(x.textContent));
    ok(!!dir, 'direction toggle shown when supported');
    ok(!$$('.sheet .btn').some((x) => /Oscillate/.test(x.textContent)), 'oscillate hidden when unsupported');
    dir.click();
    eq(mock.calls.at(-1).service, 'set_direction', 'direction toggle');
    await sleep(450);

    // cover
    const cov = pill('cover.lr_blinds');
    ptr(cov, 'pointerdown'); await sleep(560); ptr(cov, 'pointerup');
    const cs = $('.sheet input[type=range]');
    cs.value = '75'; cs.dispatchEvent(new w.Event('input')); cs.dispatchEvent(new w.Event('change'));
    eq(mock.calls.at(-1), { domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.lr_blinds', position: 75 } }, 'cover position commit');
    const btns = $$('.sheet .btn').map((x) => x.textContent.trim());
    eq(btns, ['Open', 'Stop', 'Close'], 'open / stop / close buttons');
    $$('.sheet .btn')[1].click();
    eq(mock.calls.at(-1).service, 'stop_cover', 'stop button');

    $('.sheet .more').click();
    eq(events.filter((e) => e[0] === 'more-info').at(-1), ['more-info', 'cover.lr_blinds'], '"More…" fires more-info');

    $('.sheet').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    ok(!$('.sheet-wrap').classList.contains('open'), 'Escape closes the sheet');
    await sleep(450);

    // switch sheet
    const sw = pill('switch.lr_soundbar');
    sw.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    ok($('.seg'), 'context menu opens the sheet; switch gets a big toggle');
    $$('.seg button')[1].click();
    eq(mock.calls.at(-1), { domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.lr_soundbar' } }, 'big toggle on');
    $('.close').click();
    ok(!$('.sheet-wrap').classList.contains('open'), 'close button closes');

    // unavailable hold -> more-info
    const hx = pill('switch.lr_heater');
    ptr(hx, 'pointerdown'); await sleep(560); ptr(hx, 'pointerup');
    eq(events.filter((e) => e[0] === 'more-info').at(-1), ['more-info', 'switch.lr_heater'], 'hold on unavailable opens more-info');
    void card;
  }

  console.log('all off');
  {
    const { mock, $ } = setup();
    $('.alloff').click();
    const svc = mock.calls.map((c) => `${c.domain}.${c.service}`).sort();
    eq(svc, ['fan.turn_off', 'light.turn_off', 'switch.turn_off'], 'one call per domain, covers untouched');
    eq(mock.calls.find((c) => c.domain === 'light').data.entity_id, ['light.lr_ceiling', 'light.lr_strip'], 'only lights that are on');
    ok($('.alloff').hidden, 'all-off hides once everything is off');
    eq($('.summary').textContent, 'All off · 1 open · 71° · 42%', 'summary updates');
  }

  console.log('config validation');
  {
    const { w } = setup();
    const c = w.document.createElement('glasshouse-room-card');
    const throws = (cfg) => { try { c.setConfig(cfg); return false; } catch (e) { return /glasshouse-room-card/.test(e.message); } };
    ok(throws({}), 'missing entities throws');
    ok(throws({ entities: [] }), 'empty entities throws');
    ok(throws({ entities: [{ name: 'x' }] }), 'entity without id throws');
    ok(throws({ entities: ['light.a'], columns: 9 }), 'bad columns throws');
    ok(throws({ entities: ['light.a'], motion: 'nope' }), 'bad motion id throws');
    ok(!throws({ entities: ['light.a'], columns: 3 }), 'valid config accepted');
    const stub = w.customElements.get('glasshouse-room-card').getStubConfig({ states: { 'light.x': {}, 'sensor.y': {} } });
    eq(stub.entities, ['light.x'], 'stub config picks controllable entities');
    ok(w.customCards.some((x) => x.type === 'glasshouse-room-card' && x.preview), 'registered in customCards');
  }

  {
    // a switch with a number control: body tap opens the panel with a slider; the icon still toggles
    const { mock, card, w, pill, tap } = setup();
    card.setConfig({ name: 'Tablet', entities: [{ entity: 'switch.lr_tablet', controls: ['number.lr_tablet_brightness'] }] });
    card.hass = mock.current;
    await sleep(20);
    tap(pill('switch.lr_tablet'));
    await sleep(50);
    eq(mock.calls.length, 0, 'body tap on a switch with controls does not toggle');
    const pop = w.document.querySelector('[data-glasshouse-room-pop]');
    ok(!!pop, 'body tap opens the panel');
    const range = pop && pop.shadowRoot.querySelector('input[type=range]');
    ok(!!range && range.max === '255' && range.value === '120', 'number control is a slider with its range and value');
    range.value = '200'; range.dispatchEvent(new w.Event('change'));
    eq(mock.calls.at(-1), { domain: 'number', service: 'set_value', data: { entity_id: 'number.lr_tablet_brightness', value: 200 } }, 'slider sets the number');
    card._closePop();
    tap(pill('switch.lr_tablet').querySelector('.ic'));
    await sleep(20);
    eq(mock.calls.at(-1).service, 'toggle', 'icon still toggles');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
