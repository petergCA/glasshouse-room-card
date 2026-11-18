/*!
 * Glasshouse Room Card v1.3.0
 * A room tile with full control of every device in the room.
 * Part of the Glasshouse card suite. MIT License (c) 2026 Peter Gray.
 */
(() => {
  'use strict';

  const VERSION = '1.4.0';
  const NUMBER_DOMAINS = new Set(['number', 'input_number']);
  const TAG = 'glasshouse-room-card';

  const HOLD_MS = 500;
  const DOUBLE_TAP_MS = 250;
  const MOVE_TOLERANCE = 10;
  const BUSY_MS = 5000;

  const TOGGLE_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'cover']);
  const ALL_OFF_DOMAINS = ['light', 'switch', 'fan', 'input_boolean'];
  const ACTION_DOMAINS = { script: 'turn_on', scene: 'turn_on', button: 'press', input_button: 'press' };
  const COLOR_MODES = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww']);
  const DIMMABLE_MODES = new Set(['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']);
  const UNAVAILABLE = new Set(['unavailable']);

  const ACCENTS = {
    light: 'var(--gh-light)',
    fan: 'var(--gh-fan)',
    cover: 'var(--gh-cover)',
    switch: 'var(--gh-switch)',
    input_boolean: 'var(--gh-switch)',
    media_player: 'var(--gh-media)',
    lock: 'var(--gh-lock)',
    climate: 'var(--gh-heat)',
    water_heater: 'var(--gh-heat)',
    script: 'var(--gh-info)',
    scene: 'var(--gh-info)',
    binary_sensor: 'var(--gh-info)',
    sensor: 'var(--gh-neutral)',
  };

  // Feature bit flags (Home Assistant entity features)
  const FAN_SET_SPEED = 1, FAN_OSCILLATE = 2, FAN_DIRECTION = 4;
  const COVER_OPEN = 1, COVER_CLOSE = 2, COVER_SET_POSITION = 4, COVER_STOP = 8;

  // How long a slider target is shown while waiting for the device to report it.
  const TARGET_TTL = { brightness: 8000, kelvin: 8000, percentage: 8000, position: 60000 };
  const TARGET_TOL = { brightness: 1, kelvin: 60, percentage: 2, position: 1 };

  const domainOf = (id) => String(id).split('.')[0];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const STYLE = `
    :host {
      --gh-font: var(--glasshouse-font, -apple-system, "SF Pro Text", Inter, Roboto, system-ui, sans-serif);
      --gh-surface: var(--glasshouse-surface, rgba(255,255,255,0.045));
      --gh-surface-2: var(--glasshouse-surface-2, rgba(255,255,255,0.075));
      --gh-border: var(--glasshouse-border, rgba(255,255,255,0.09));
      --gh-blur: var(--glasshouse-blur, 18px);
      --gh-radius: var(--glasshouse-radius, 22px);
      --gh-radius-sm: var(--glasshouse-radius-sm, 14px);
      --gh-pad: var(--glasshouse-pad, 16px);
      --gh-gap: var(--glasshouse-gap, 10px);
      --gh-text: var(--glasshouse-text, #e9eef6);
      --gh-text-2: var(--glasshouse-text-2, #93a0b5);
      --gh-text-3: var(--glasshouse-text-3, #5d697d);
      --gh-ok: var(--glasshouse-ok, #3fb950);
      --gh-warn: var(--glasshouse-warn, #e3b341);
      --gh-alert: var(--glasshouse-alert, #ff5c5c);
      --gh-info: var(--glasshouse-info, #58a6ff);
      --gh-light: var(--glasshouse-light, #ffb547);
      --gh-fan: var(--glasshouse-fan, #4dd6e8);
      --gh-cover: var(--glasshouse-cover, #a3a8ff);
      --gh-switch: var(--glasshouse-switch, #7ee08a);
      --gh-heat: var(--glasshouse-heat, #ff7a59);
      --gh-cool: var(--glasshouse-cool, #58a6ff);
      --gh-media: var(--glasshouse-media, #c48cff);
      --gh-lock: var(--glasshouse-lock, #3fb950);
      --gh-security: var(--glasshouse-security, #ff5c5c);
      --gh-energy: var(--glasshouse-energy, #f6d365);
      --gh-water: var(--glasshouse-water, #4aa8ff);
      --gh-neutral: var(--glasshouse-neutral, #93a0b5);
      --gh-accent: var(--gh-info);
      --gh-ease: 160ms ease;
      display: block;
    }
    * { box-sizing: border-box; }
    ha-card {
      display: block;
      position: relative;
      container: gh-room / inline-size;
      background: var(--gh-surface);
      border: 1px solid var(--gh-border);
      border-radius: var(--gh-radius);
      -webkit-backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      padding: var(--gh-pad);
      color: var(--gh-text);
      font-family: var(--gh-font);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.3;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    button {
      font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    button:focus { outline: none; }
    button:focus-visible, input:focus-visible {
      outline: 2px solid var(--gh-accent); outline-offset: 2px;
    }
    ha-icon, ha-state-icon { display: inline-flex; --mdc-icon-size: 22px; }

    /* ---------- header ---------- */
    .head { display: flex; align-items: center; gap: 12px; min-height: 44px; }
    .room-ic {
      position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--gh-surface-2); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease);
    }
    .room-ic.on {
      --a: var(--room-accent, var(--gh-light));
      background: color-mix(in srgb, var(--a) 16%, transparent);
      color: var(--a);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--a) 45%, transparent), 0 0 18px -6px var(--a);
    }
    .room-ic ha-icon { --mdc-icon-size: 22px; }
    .motion {
      position: absolute; top: 1px; right: 1px; width: 10px; height: 10px; border-radius: 50%;
      background: var(--gh-text-3);
      box-shadow: 0 0 0 2px rgba(10, 14, 22, 0.92);
      transition: background var(--gh-ease), box-shadow var(--gh-ease);
    }
    .motion.on {
      background: var(--gh-info);
      box-shadow: 0 0 0 2px rgba(10, 14, 22, 0.92), 0 0 10px 1px var(--gh-info);
      animation: gh-breathe 2.4s ease-in-out infinite;
    }
    @keyframes gh-breathe { 50% { box-shadow: 0 0 0 2px rgba(10,14,22,.92), 0 0 4px 0 var(--gh-info); } }
    .titles { flex: 1 1 auto; min-width: 0; }
    .title {
      font-size: 16px; font-weight: 650; letter-spacing: -0.005em; line-height: 1.25;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .summary {
      margin-top: 2px; color: var(--gh-text-2); font-size: 13px; font-weight: 500;
      font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .summary .n { color: var(--gh-text); font-weight: 600; }
    .tools { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .chip {
      position: relative; display: inline-flex; align-items: center; gap: 5px;
      height: 32px; padding: 0 11px 0 8px; border-radius: 999px;
      background: var(--gh-surface-2); color: var(--gh-text);
      font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;
      transition: background var(--gh-ease);
    }
    .chip::before { content: ""; position: absolute; inset: -6px -2px; }
    .chip ha-icon { --mdc-icon-size: 18px; color: var(--gh-text-2); }
    .chip.t ha-icon { color: var(--gh-heat); }
    .chip.h ha-icon { color: var(--gh-water); }
    .chip:hover { background: rgba(255,255,255,0.11); }
    .alloff {
      width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      background: var(--gh-surface-2); color: var(--gh-text);
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease), opacity var(--gh-ease), transform var(--gh-ease);
    }
    .alloff ha-icon { --mdc-icon-size: 20px; }
    .alloff:hover { color: var(--gh-alert); background: color-mix(in srgb, var(--gh-alert) 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-alert) 40%, transparent); }
    .alloff:active { transform: scale(0.94); }
    [hidden] { display: none !important; }
    @container gh-room (max-width: 440px) { .chips { display: none; } }

    /* ---------- pill grid ---------- */
    .grid {
      display: grid; gap: var(--gh-gap); margin-top: 14px;
      grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
    }
    @container gh-room (min-width: 520px) { .grid.auto { --cols: 3; } }
    @container gh-room (min-width: 860px) { .grid.auto { --cols: 4; } }
    .pill {
      --accent: var(--gh-neutral);
      position: relative; display: flex; align-items: center; gap: 10px;
      min-height: 60px; padding: 10px 12px 10px 10px; text-align: left;
      border-radius: var(--gh-radius-sm);
      background: var(--gh-surface-2);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.025);
      user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
      touch-action: manipulation;
      transition: background var(--gh-ease), box-shadow var(--gh-ease), opacity var(--gh-ease), transform 120ms ease;
    }
    .pill:hover { background: rgba(255,255,255,0.095); }
    .pill:active { transform: scale(0.975); }
    .pill .ic {
      position: relative; flex: 0 0 auto; width: 38px; height: 38px; border-radius: 12px;
      display: grid; place-items: center;
      background: rgba(255,255,255,0.06); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease);
    }
    .pill .tx { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; gap: 2px; }
    .pill .nm {
      font-size: 13px; font-weight: 600; line-height: 1.22; color: var(--gh-text);
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      overflow: hidden; overflow-wrap: anywhere;
    }
    .pill .st {
      font-size: 12px; font-weight: 500; color: var(--gh-text-2);
      font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      transition: color var(--gh-ease);
    }
    .pill .lvl {
      position: absolute; left: 58px; right: 12px; bottom: 6px; height: 2px; border-radius: 2px;
      background: rgba(255,255,255,0.07); overflow: hidden; opacity: 0; transition: opacity var(--gh-ease);
    }
    .pill .lvl::after {
      content: ""; position: absolute; inset: 0 auto 0 0; width: var(--level, 0%);
      background: var(--accent); border-radius: 2px; transition: width 240ms ease;
    }
    .pill.has-lvl .lvl { opacity: 1; }
    .pill.on {
      background: color-mix(in srgb, var(--accent) 16%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 18px -6px var(--accent);
    }
    .pill.on .ic { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
    .pill.on .st { color: var(--accent); }
    .pill.on .lvl { background: color-mix(in srgb, var(--accent) 18%, transparent); }
    .pill.sel { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--gh-text) 55%, transparent); }
    .pill.on.sel {
      box-shadow: inset 0 0 0 1.5px var(--accent), 0 0 18px -6px var(--accent);
    }
    .pill.busy .ic > :first-child { animation: gh-busy 0.9s ease-in-out infinite; }
    @keyframes gh-busy { 50% { opacity: 0.35; } }
    .pill.spin .ic > :first-child { animation: gh-spin var(--spin, 2s) linear infinite; }
    @keyframes gh-spin { to { transform: rotate(360deg); } }
    .pill.unavail { opacity: 0.45; cursor: default; }
    .pill.unavail:active { transform: none; }
    .badge {
      position: absolute; right: -5px; bottom: -5px; width: 18px; height: 18px; border-radius: 50%;
      display: none; place-items: center; background: #1a2130; color: var(--gh-warn);
      box-shadow: 0 0 0 2px rgba(10,14,22,0.9);
    }
    .badge ha-icon { --mdc-icon-size: 14px; }
    .pill.unavail .badge { display: grid; }
    .pill.alert { box-shadow: inset 0 0 0 1px var(--gh-alert); animation: gh-pulse 2.4s ease-in-out infinite; }
    @keyframes gh-pulse { 50% { box-shadow: inset 0 0 0 1px var(--gh-alert), 0 0 22px -4px var(--gh-alert); } }

    /* ---------- control sheet ---------- */
    .sheet-wrap {
      display: grid; grid-template-rows: 0fr; opacity: 0;
      transition: grid-template-rows 280ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease, margin-top 280ms ease;
      margin-top: 0;
    }
    .sheet-wrap.open { grid-template-rows: 1fr; opacity: 1; margin-top: var(--gh-gap); }
    .sheet-clip { min-height: 0; overflow: hidden; }
    .sheet {
      --accent: var(--gh-neutral);
      border-radius: 18px; padding: 14px;
      background: rgba(255,255,255,0.055);
      box-shadow: inset 0 0 0 1px var(--gh-border);
    }
    .sheet.swap { animation: gh-fade 220ms ease; }
    @keyframes gh-fade { from { opacity: 0; transform: translateY(-4px); } }
    .sh-head { display: flex; align-items: center; gap: 12px; }
    .sh-head .ic {
      flex: 0 0 auto; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
      background: rgba(255,255,255,0.06); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease);
    }
    .sheet.on .sh-head .ic { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
    .sh-titles { flex: 1 1 auto; min-width: 0; }
    .sh-name { font-size: 15px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sh-state { font-size: 12px; color: var(--gh-text-2); font-variant-numeric: tabular-nums; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sheet.on .sh-state { color: var(--accent); }
    .close {
      position: relative; flex: 0 0 auto; width: 32px; height: 32px; border-radius: 50%;
      display: grid; place-items: center; background: rgba(255,255,255,0.07); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease);
    }
    .close::before { content: ""; position: absolute; inset: -6px; }
    .close:hover { background: rgba(255,255,255,0.12); color: var(--gh-text); }
    .close ha-icon { --mdc-icon-size: 18px; }
    .sw {
      position: relative; flex: 0 0 auto; width: 50px; height: 30px; border-radius: 999px;
      background: rgba(255,255,255,0.12);
      transition: background var(--gh-ease), box-shadow var(--gh-ease);
    }
    .sw::before { content: ""; position: absolute; inset: -7px -3px; }
    .sw::after {
      content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%;
      background: #f4f7fb; box-shadow: 0 2px 6px rgba(0,0,0,0.35); transition: transform 180ms ease;
    }
    .sw[aria-checked="true"] { background: var(--accent); box-shadow: 0 0 16px -6px var(--accent); }
    .sw[aria-checked="true"]::after { transform: translateX(20px); }
    .sh-body { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; }
    .subl { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.07); }
    .subl-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .subl-t { display: flex; flex-direction: column; min-width: 0; }
    .subl-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .subl-state { font-size: 12px; color: var(--gh-text-2); }
    .subl.dead .ctl { opacity: 0.45; }
    .ctl-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .ctl-label {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em; color: var(--gh-text-2);
    }
    .ctl-val { font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--gh-text); }
    .ctl.dim .ctl-val { color: var(--gh-text-2); }

    input[type=range] {
      --p: 0; --tw: 20px;
      --fill: color-mix(in srgb, var(--accent) 78%, transparent);
      --track: rgba(255,255,255,0.08);
      -webkit-appearance: none; appearance: none; display: block;
      width: 100%; height: 40px; margin: 0; border-radius: 12px; background: transparent; cursor: pointer;
      touch-action: pan-y;
    }
    input[type=range]::-webkit-slider-runnable-track {
      height: 40px; border-radius: 12px;
      background: linear-gradient(90deg, var(--fill) 0 calc((var(--tw) / 2 + (100% - var(--tw)) * var(--p)) * var(--f, 1)), var(--track) 0);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
    }
    input[type=range]::-moz-range-track {
      height: 40px; border-radius: 12px;
      background: linear-gradient(90deg, var(--fill) 0 calc((var(--tw) / 2 + (100% - var(--tw)) * var(--p)) * var(--f, 1)), var(--track) 0);
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: var(--tw); height: 40px; border: 0; border-radius: 12px;
      background: linear-gradient(#fff, #fff) center / 4px 20px no-repeat;
    }
    input[type=range]::-moz-range-thumb {
      width: var(--tw); height: 40px; border: 0; border-radius: 12px;
      background: linear-gradient(#fff, #fff) center / 4px 20px no-repeat;
    }
    input[type=range].hue { --tw: 30px; }
    input[type=range].hue::-webkit-slider-runnable-track {
      background: linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00); opacity: 0.85; }
    input[type=range].hue::-moz-range-track {
      background: linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00); opacity: 0.85; }
    input[type=range].hue::-webkit-slider-thumb {
      background: radial-gradient(circle at center, transparent 8px, #fff 8.5px, #fff 11px, transparent 11.5px);
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.45)); }
    input[type=range].hue::-moz-range-thumb {
      background: radial-gradient(circle at center, transparent 8px, #fff 8.5px, #fff 11px, transparent 11.5px); }
    /* ---------- floating control popover (lives in a portal on <body>) ---------- */
    .pop { position: fixed; z-index: 9; width: min(320px, calc(100vw - 16px)); }
    .pop .sheet { background: rgba(16, 22, 34, 0.92); -webkit-backdrop-filter: blur(22px) saturate(140%); backdrop-filter: blur(22px) saturate(140%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10), 0 18px 48px -12px rgba(0,0,0,0.7); animation: gh-pop 160ms cubic-bezier(.2,.8,.2,1); }
    @keyframes gh-pop { from { opacity: 0; transform: scale(.96); } }
    .pill .ic { cursor: pointer; }
    input[type=range].kelvin { --tw: 30px; }
    input[type=range].kelvin::-webkit-slider-runnable-track {
      background: linear-gradient(90deg, #ff9f43, #ffc98a 28%, #fff1dc 55%, #e8f0ff 80%, #c9dcff);
      opacity: 0.85;
    }
    input[type=range].kelvin::-moz-range-track {
      background: linear-gradient(90deg, #ff9f43, #ffc98a 28%, #fff1dc 55%, #e8f0ff 80%, #c9dcff);
      opacity: 0.85;
    }
    input[type=range].kelvin::-webkit-slider-thumb {
      background: radial-gradient(circle at center, transparent 8px, #fff 8.5px, #fff 11px, transparent 11.5px);
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.45));
    }
    input[type=range].kelvin::-moz-range-thumb {
      background: radial-gradient(circle at center, transparent 8px, #fff 8.5px, #fff 11px, transparent 11.5px);
    }
    .ctl.dim input[type=range] { opacity: 0.55; }
    .ticks { position: relative; height: 16px; margin-top: 6px; }
    .ticks span {
      position: absolute; top: 0; transform: translateX(-50%);
      left: calc(10px + (100% - 20px) * var(--t));
      font-size: 11px; font-weight: 600; color: var(--gh-text-3); font-variant-numeric: tabular-nums;
      transition: color var(--gh-ease);
    }
    .ticks span.cur { color: var(--accent); }

    .btns { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; }
    .xbtns { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .xic { display: inline-flex; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 44px; padding: 0 12px; border-radius: 12px;
      background: rgba(255,255,255,0.07); color: var(--gh-text); font-size: 13px; font-weight: 600;
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease), opacity var(--gh-ease);
    }
    .btn ha-icon { --mdc-icon-size: 18px; color: var(--gh-text-2); }
    .btn:hover { background: rgba(255,255,255,0.11); }
    .btn:disabled { opacity: 0.4; cursor: default; }
    .btn[aria-pressed="true"] {
      background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
    }
    .btn[aria-pressed="true"] ha-icon { color: var(--accent); }
    .seg {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 16px;
      background: rgba(255,255,255,0.06);
    }
    .seg button {
      height: 52px; border-radius: 12px; font-size: 14px; font-weight: 650; color: var(--gh-text-2);
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease);
    }
    .seg button ha-icon { --mdc-icon-size: 20px; }
    .seg button[aria-pressed="true"] { background: rgba(255,255,255,0.12); color: var(--gh-text); }
    .seg button.on[aria-pressed="true"] {
      background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent), 0 0 18px -6px var(--accent);
    }
    .readout { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
    .readout small { font-size: 13px; font-weight: 600; color: var(--gh-text-2); margin-left: 3px; }
    .sh-foot { display: flex; justify-content: flex-end; margin-top: 12px; }
    .more {
      display: inline-flex; align-items: center; gap: 2px; min-height: 32px; padding: 0 4px 0 10px;
      border-radius: 10px; color: var(--gh-text-2); font-size: 13px; font-weight: 600;
      transition: color var(--gh-ease), background var(--gh-ease);
    }
    .more ha-icon { --mdc-icon-size: 18px; }
    .more:hover { color: var(--gh-text); background: rgba(255,255,255,0.06); }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }
  `;

  /* ---------------------------------------------------------------- helpers */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  function icon(name) {
    const el = document.createElement('ha-icon');
    el.setAttribute('icon', name);
    el.icon = name;
    return el;
  }

  function isUnavailable(st) {
    return !st || UNAVAILABLE.has(st.state);
  }

  function isActive(st) {
    if (!st) return false;
    const d = domainOf(st.entity_id);
    if (d === 'cover') return ['open', 'opening', 'closing'].includes(st.state);
    if (d === 'lock') return st.state === 'unlocked';
    if (d === 'media_player') return ['playing', 'on', 'paused', 'buffering'].includes(st.state);
    if (d === 'climate') return st.state !== 'off';
    return st.state === 'on';
  }

  function lightCaps(st) {
    const modes = (st && st.attributes.supported_color_modes) || [];
    const dimmable = modes.some((m) => DIMMABLE_MODES.has(m)) ||
      (!modes.length && isNum(st && st.attributes.brightness));
    return { dimmable, temp: modes.includes('color_temp'), color: modes.some((m) => COLOR_MODES.has(m)) };
  }

  function lightAccent(st) {
    const a = st.attributes;
    if (st.state === 'on' && COLOR_MODES.has(a.color_mode) && Array.isArray(a.rgb_color)) {
      const [r, g, b] = a.rgb_color.map((n) => clamp(Math.round(n), 0, 255));
      return `rgb(${r}, ${g}, ${b})`;
    }
    return null;
  }

  function brightnessPct(st) {
    if (!st || st.state !== 'on') return 0;
    const b = st.attributes.brightness;
    return isNum(b) ? clamp(Math.round((Number(b) / 255) * 100), 1, 100) : 100;
  }

  function kelvinOf(st) {
    const a = st.attributes;
    if (isNum(a.color_temp_kelvin)) return Number(a.color_temp_kelvin);
    if (isNum(a.color_temp)) return Math.round(1e6 / Number(a.color_temp));
    return null;
  }

  function kelvinRange(st) {
    const a = st.attributes;
    let min = a.min_color_temp_kelvin, max = a.max_color_temp_kelvin;
    if (!isNum(min) && isNum(a.max_mireds)) min = Math.round(1e6 / a.max_mireds);
    if (!isNum(max) && isNum(a.min_mireds)) max = Math.round(1e6 / a.min_mireds);
    return { min: isNum(min) ? Number(min) : 2000, max: isNum(max) ? Number(max) : 6500 };
  }

  function fanSteps(st) {
    const step = Number(st.attributes.percentage_step);
    const n = step > 0 ? Math.round(100 / step) : 100;
    return clamp(n, 1, 100);
  }

  function fanSupportsSpeed(st) {
    const sf = Number(st.attributes.supported_features) || 0;
    return (sf & FAN_SET_SPEED) !== 0 || isNum(st.attributes.percentage);
  }

  function coverHasPosition(st) {
    const sf = st.attributes.supported_features;
    if (isNum(sf)) return (Number(sf) & COVER_SET_POSITION) !== 0;
    return isNum(st.attributes.current_position);
  }

  function coverSupports(st, bit) {
    const sf = st.attributes.supported_features;
    return !isNum(sf) || (Number(sf) & bit) !== 0;
  }

  /* ------------------------------------------------------------------ card */

  class GlasshouseRoomCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._seen = new Map();
      this._pills = new Map();
      this._targets = new Map();
      this._busy = new Map();
      this._tapTimers = new Map();
      this._sheet = null; // { eid, el, update }
      this._built = false;
    }

    static getStubConfig(hass) {
      const ids = Object.keys((hass && hass.states) || {});
      const pick = ids.filter((id) => ['light', 'fan', 'cover', 'switch'].includes(domainOf(id))).slice(0, 4);
      return { name: 'Living Room', icon: 'mdi:sofa', entities: pick.length ? pick : ['light.example'] };
    }

    setConfig(config) {
      if (!config || typeof config !== 'object') throw new Error('glasshouse-room-card: invalid configuration');
      if (!Array.isArray(config.entities) || !config.entities.length) {
        throw new Error('glasshouse-room-card: "entities" must be a non-empty list');
      }
      const entities = config.entities.map((e, i) => {
        const o = typeof e === 'string' ? { entity: e } : { ...e };
        if (!o.entity || typeof o.entity !== 'string' || !o.entity.includes('.')) {
          throw new Error(`glasshouse-room-card: entities[${i}] needs a valid "entity" id`);
        }
        o.controls = (Array.isArray(o.controls) ? o.controls : []).map((c) => (typeof c === 'string' ? { entity: c } : { ...c }))
          .filter((c) => c && typeof c.entity === 'string' && c.entity.includes('.'));
        return o;
      });
      for (const k of ['temperature', 'humidity', 'motion']) {
        if (config[k] !== undefined && (typeof config[k] !== 'string' || !config[k].includes('.'))) {
          throw new Error(`glasshouse-room-card: "${k}" must be an entity id`);
        }
      }
      let columns = config.columns === undefined || config.columns === 'auto' ? 'auto' : Number(config.columns);
      if (columns !== 'auto' && !(Number.isInteger(columns) && columns >= 1 && columns <= 6)) {
        throw new Error('glasshouse-room-card: "columns" must be a whole number from 1 to 6, or "auto"');
      }
      this._config = { ...config, entities, columns };
      this._ctlOwner = new Map();
      for (const e of entities) for (const c of e.controls) this._ctlOwner.set(c.entity, e.entity);
      this._watch = [
        ...entities.map((e) => e.entity),
        ...this._ctlOwner.keys(),
        ...['temperature', 'humidity', 'motion'].map((k) => config[k]).filter(Boolean),
      ];
      this._built = false;
      this._seen.clear();
      this._targets.clear();
      this._sheet = null;
      if (this._hass) this.hass = this._hass;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config || !hass) return;
      if (!this._built) this._build();
      const changed = [];
      for (const id of this._watch) {
        const st = hass.states[id];
        if (st !== this._seen.get(id) || !this._seen.has(id)) {
          this._seen.set(id, st);
          changed.push(id);
        }
      }
      if (!changed.length) return;
      for (const id of changed) {
        this._clearBusy(id);
        if (this._pills.has(id)) this._updatePill(id);
        if (this._sheet && this._sheet.eid === id) this._sheet.update();
        if (this._pop && this._pop.eid === id) this._pop.update();
        const owner = this._ctlOwner && this._ctlOwner.get(id);
        if (owner) {
          if (this._sheet && this._sheet.eid === owner) this._sheet.update();
          if (this._pop && this._pop.eid === owner) this._pop.update();
        }
      }
      this._updateHeader();
    }

    get hass() { return this._hass; }

    getCardSize() {
      const n = this._config ? this._config.entities.length : 4;
      return 1 + Math.ceil(n / 2);
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: 'auto' };
    }

    disconnectedCallback() {
      this._closePop();
      for (const t of this._tapTimers.values()) clearTimeout(t);
      this._tapTimers.clear();
      for (const t of this._busy.values()) clearTimeout(t);
      this._busy.clear();
    }

    /* ------------------------------------------------------------- build */

    _build() {
      const c = this._config;
      const root = this.shadowRoot;
      root.innerHTML = '';
      root.append(h('style', { text: STYLE }));
      this._pills.clear();

      const card = document.createElement('ha-card');

      // header
      const roomIc = h('div', { class: 'room-ic' }, [icon(c.icon || 'mdi:home-outline')]);
      this._motion = c.motion ? h('span', { class: 'motion', role: 'img' }) : null;
      if (this._motion) roomIc.append(this._motion);
      this._roomIc = roomIc;
      this._title = h('div', { class: 'title', text: c.name || 'Room' });
      this._summary = h('div', { class: 'summary' });
      const titles = h('div', { class: 'titles' }, [this._title, this._summary]);

      const chips = h('div', { class: 'chips tools' });
      this._chips = {};
      for (const [k, ic, cls] of [['temperature', 'mdi:thermometer', 't'], ['humidity', 'mdi:water-percent', 'h']]) {
        if (!c[k]) continue;
        const val = h('span');
        const chip = h('button', { class: `chip ${cls}`, type: 'button' }, [icon(ic), val]);
        chip.addEventListener('click', () => this._moreInfo(c[k]));
        chips.append(chip);
        this._chips[k] = { chip, val };
      }
      this._allOff = h('button', { class: 'alloff', type: 'button', hidden: true,
        'aria-label': `Turn off everything in ${c.name || 'this room'}`, title: 'All off' }, [icon('mdi:power')]);
      this._allOff.addEventListener('click', () => this._turnAllOff());
      const tools = h('div', { class: 'tools' }, [chips, this._allOff]);
      const head = h('div', { class: 'head' }, [roomIc, titles, tools]);

      // grid
      const grid = h('div', { class: c.columns === 'auto' ? 'grid auto' : 'grid' });
      if (c.columns !== 'auto') grid.style.setProperty('--cols', String(c.columns));
      for (const ent of c.entities) {
        if (this._pills.has(ent.entity)) continue; // ignore duplicates
        const pill = this._makePill(ent);
        grid.append(pill.el);
        this._pills.set(ent.entity, pill);
      }

      // sheet container
      this._sheetClip = h('div', { class: 'sheet-clip' });
      this._sheetWrap = h('div', { class: 'sheet-wrap' }, [this._sheetClip]);
      this._sheetWrap.addEventListener('transitionend', (e) => {
        if (e.target === this._sheetWrap && !this._sheetWrap.classList.contains('open') && !this._sheet) {
          this._sheetClip.innerHTML = '';
        }
      });

      card.append(head, grid, this._sheetWrap);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._sheet) { e.stopPropagation(); this._closeSheet(); }
      });
      root.append(card);
      this._built = true;
    }

    _makePill(ent) {
      const eid = ent.entity;
      const iconHost = h('span', { class: 'ic' });
      const badge = h('span', { class: 'badge', 'aria-hidden': 'true' }, [icon('mdi:alert-circle-outline')]);
      const nm = h('span', { class: 'nm' });
      const st = h('span', { class: 'st' });
      const lvl = h('span', { class: 'lvl', 'aria-hidden': 'true' });
      const el = h('button', { class: 'pill', type: 'button', 'data-entity': eid },
        [iconHost, h('span', { class: 'tx' }, [nm, st]), lvl]);
      iconHost.append(badge);
      const pill = { ent, el, iconHost, badge, nm, st, lvl, iconEl: null, iconKey: null };
      this._bindGestures(el, eid);
      return pill;
    }

    /* ------------------------------------------------------------ gestures */

    _bindGestures(el, eid) {
      let timer = null, active = false, held = false, heldAt = 0, sx = 0, sy = 0;
      const cancel = () => { active = false; clearTimeout(timer); };
      el.addEventListener('pointerdown', (e) => {
        if (e.button) return; // primary button / touch only
        active = true; held = false; sx = e.clientX; sy = e.clientY;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!active) return;
          held = true; heldAt = Date.now(); active = false;
          this._onHold(eid);
        }, HOLD_MS);
      });
      el.addEventListener('pointermove', (e) => {
        if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_TOLERANCE) cancel();
      });
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('pointerleave', cancel);
      el.addEventListener('pointerup', (e) => {
        clearTimeout(timer);
        if (!active) return;
        active = false;
        if (held) return;
        const pill = this._pills.get(eid);
        const onIcon = pill && pill.iconHost && e.composedPath().includes(pill.iconHost);
        if (onIcon) { this._primary(eid); return; }
        if (this._adjustable(eid)) { this._openPop(eid, e.clientX, e.clientY); return; }
        this._onTap(eid);
      });
      // keyboard activation (Enter / Space) produces a click with detail 0
      el.addEventListener('click', (e) => {
        if (e.detail === 0) this._primary(eid);
      });
      // right click, the context-menu key, Shift+F10: open the sheet
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (active || Date.now() - heldAt < 800) return; // a touch hold handles it
        this._onHold(eid);
      });
    }

    _onTap(eid) {
      const st = this._hass && this._hass.states[eid];
      if (isUnavailable(st)) return;
      const d = domainOf(eid);
      if (!TOGGLE_DOMAINS.has(d) && !ACTION_DOMAINS[d]) { this._moreInfo(eid); return; }
      const pending = this._tapTimers.get(eid);
      if (pending) {
        clearTimeout(pending);
        this._tapTimers.delete(eid);
        this._moreInfo(eid);
        return;
      }
      this._tapTimers.set(eid, setTimeout(() => {
        this._tapTimers.delete(eid);
        this._primary(eid);
      }, DOUBLE_TAP_MS));
    }

    /** Has more than on/off: the body tap opens the floating controls instead of toggling. */
    _adjustable(eid) {
      const st = this._hass && this._hass.states[eid];
      if (isUnavailable(st)) return false;
      const d = domainOf(eid);
      if (d === 'light') { const c = lightCaps(st); if (c.dimmable || c.temp || c.color) return true; }
      if (d === 'fan') return fanSupportsSpeed(st);
      if (d === 'cover') return isNum(st.attributes.current_position);
      // any device with extra controls (e.g. a tablet screen switch + its brightness number) opens the panel too
      const own = this._config.entities.find((x) => x.entity === eid);
      if (!(own && own.controls.length)) return false;
      // bulbs behind a wall switch: while the switch is off they have no power, so a tap just switches it on
      if (own.controls.some((c) => domainOf(c.entity) === 'light') && !isActive(st)) return false;
      return true;
    }

    _openPop(eid, x, y) {
      const pill = this._pills.get(eid);
      if (!pill) return;
      const same = this._pop && this._pop.eid === eid;
      this._closePop();
      if (same) return;
      this._haptic('light');
      const host = document.createElement('div');
      host.setAttribute('data-glasshouse-room-pop', '');
      const root = host.attachShadow({ mode: 'open' });
      root.append(h('style', { text: STYLE }));
      const sheet = this._buildSheet(pill.ent, () => this._closePop());
      const wrap = h('div', { class: 'pop' }, [sheet.el]);
      root.append(wrap);
      document.body.append(host);
      sheet.update();
      const vw = window.innerWidth, vh = window.innerHeight;
      const r = wrap.getBoundingClientRect();
      const left = clamp(x - r.width / 2, 8, Math.max(8, vw - r.width - 8));
      let top = y + 14;
      if (top + r.height > vh - 8) top = y - r.height - 14;
      wrap.style.left = `${left}px`;
      wrap.style.top = `${clamp(top, 8, Math.max(8, vh - r.height - 8))}px`;
      pill.el.classList.add('sel');
      const outside = (e) => { if (!e.composedPath().includes(wrap) && !e.composedPath().includes(pill.el)) this._closePop(); };
      const key = (e) => { if (e.key === 'Escape') this._closePop(); };
      const away = () => this._closePop();
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', key, true);
      window.addEventListener('resize', away);
      this._pop = { eid, host, el: sheet.el, update: sheet.update, off: () => {
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', key, true);
        window.removeEventListener('resize', away);
        pill.el.classList.remove('sel');
      } };
      const first = wrap.querySelector('input[type=range]');
      if (first) first.focus({ preventScroll: true });
    }

    _closePop() {
      if (!this._pop) return;
      const p = this._pop;
      this._pop = null;
      p.off();
      p.host.remove();
    }

    _onHold(eid) {
      const st = this._hass && this._hass.states[eid];
      if (isUnavailable(st)) { this._moreInfo(eid); return; }
      this._haptic('medium');
      if (this._sheet && this._sheet.eid === eid) this._closeSheet();
      else this._openSheet(eid, true);
    }

    _primary(eid) {
      const st = this._hass && this._hass.states[eid];
      if (isUnavailable(st)) return;
      const d = domainOf(eid);
      if (TOGGLE_DOMAINS.has(d)) {
        this._call(d, 'toggle', { entity_id: eid });
        this._setBusy(eid);
        this._haptic('light');
      } else if (ACTION_DOMAINS[d]) {
        this._call(d, ACTION_DOMAINS[d], { entity_id: eid });
        this._haptic('light');
      } else {
        this._moreInfo(eid);
      }
    }

    /* ------------------------------------------------------------ actions */

    _call(domain, service, data) {
      if (!this._hass) return undefined;
      try {
        const p = this._hass.callService(domain, service, data);
        if (p && typeof p.catch === 'function') {
          p.catch((err) => console.warn(`[${TAG}] ${domain}.${service} failed`, err));
        }
        return p;
      } catch (err) {
        console.warn(`[${TAG}] ${domain}.${service} failed`, err);
        return undefined;
      }
    }

    _moreInfo(entityId) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }

    _haptic(kind) {
      this.dispatchEvent(new CustomEvent('haptic', { detail: kind || 'light', bubbles: true, composed: true }));
    }

    _setBusy(eid) {
      this._clearBusy(eid);
      const pill = this._pills.get(eid);
      if (pill) pill.el.classList.add('busy');
      this._busy.set(eid, setTimeout(() => this._clearBusy(eid), BUSY_MS));
    }

    _clearBusy(eid) {
      const t = this._busy.get(eid);
      if (t) clearTimeout(t);
      this._busy.delete(eid);
      const pill = this._pills.get(eid);
      if (pill) pill.el.classList.remove('busy');
    }

    _onEntities() {
      const out = [];
      for (const { entity } of this._config.entities) {
        const st = this._hass.states[entity];
        if (ALL_OFF_DOMAINS.includes(domainOf(entity)) && st && st.state === 'on') out.push(entity);
      }
      return out;
    }

    _turnAllOff() {
      const ids = this._onEntities();
      const byDomain = {};
      for (const id of ids) (byDomain[domainOf(id)] = byDomain[domainOf(id)] || []).push(id);
      for (const [d, list] of Object.entries(byDomain)) {
        this._call(d, 'turn_off', { entity_id: list });
        list.forEach((id) => this._setBusy(id));
      }
      if (ids.length) this._haptic('light');
    }

    /* ----------------------------------------- pending slider targets */

    _setTarget(eid, key, value) {
      const k = `${eid}|${key}`;
      const prev = this._targets.get(k);
      if (prev && prev.timer) clearTimeout(prev.timer);
      const timer = setTimeout(() => {
        if (this._targets.get(k) && this._targets.get(k).value === value) {
          this._targets.delete(k);
          this._refresh(eid);
        }
      }, TARGET_TTL[key] || 8000);
      this._targets.set(k, { value, at: Date.now(), timer });
    }

    /** The value to display: the pending target until the entity reports it (or the target expires). */
    _shown(eid, key, actual) {
      const k = `${eid}|${key}`;
      const t = this._targets.get(k);
      if (!t) return actual;
      const expired = Date.now() - t.at > (TARGET_TTL[key] || 8000);
      if (expired || (actual !== null && Math.abs(actual - t.value) <= (TARGET_TOL[key] || 1))) {
        clearTimeout(t.timer);
        this._targets.delete(k);
        return actual;
      }
      return t.value;
    }

    _refresh(eid) {
      if (this._pills.has(eid)) this._updatePill(eid);
      if (this._sheet && this._sheet.eid === eid) this._sheet.update();
    }

    /* ------------------------------------------------------- state text */

    _levelOf(eid, st) {
      const d = domainOf(eid);
      if (d === 'light' && lightCaps(st).dimmable) return this._shown(eid, 'brightness', brightnessPct(st));
      if (d === 'fan' && fanSupportsSpeed(st)) {
        const pct = st.state === 'on' ? (isNum(st.attributes.percentage) ? Number(st.attributes.percentage) : 100) : 0;
        return this._shown(eid, 'percentage', pct);
      }
      if (d === 'cover' && coverHasPosition(st) && isNum(st.attributes.current_position)) {
        return this._shown(eid, 'position', Number(st.attributes.current_position));
      }
      return null;
    }

    _fanText(st, pct) {
      if (!pct) return 'Off';
      const n = fanSteps(st);
      if (n <= 10) return `Speed ${clamp(Math.round((pct / 100) * n), 1, n)}/${n}`;
      return `${Math.round(pct)}%`;
    }

    _coverText(st, pos) {
      const s = st.state;
      const hasPos = pos !== null && pos !== undefined;
      if (s === 'opening' || s === 'closing') return `${cap(s)}${hasPos ? ` ${Math.round(pos)}%` : ''}`;
      if (hasPos) {
        if (pos <= 0) return 'Closed';
        if (pos >= 100) return 'Open';
        return `Open ${Math.round(pos)}%`;
      }
      return s === 'closed' ? 'Closed' : s === 'open' ? 'Open' : this._genericText(st);
    }

    _genericText(st) {
      if (!st) return 'Not found';
      if (st.state === 'unavailable') return 'Unavailable';
      if (st.state === 'unknown') return 'Unknown';
      if (this._hass && typeof this._hass.formatEntityState === 'function') {
        try { return this._hass.formatEntityState(st); } catch (_) { /* fall through */ }
      }
      const unit = st.attributes.unit_of_measurement;
      if (st.state === 'on' || st.state === 'off') return cap(st.state);
      return unit ? `${st.state} ${unit}` : cap(st.state);
    }

    _stateText(eid, st) {
      if (!st) return 'Not found';
      if (isUnavailable(st)) return 'Unavailable';
      const d = domainOf(eid);
      const level = this._levelOf(eid, st);
      if (d === 'light') {
        if (level !== null) return level > 0 ? `${Math.round(level)}%` : 'Off';
        return st.state === 'on' ? 'On' : 'Off';
      }
      if (d === 'fan') {
        if (level !== null) return this._fanText(st, level);
        return st.state === 'on' ? 'On' : 'Off';
      }
      if (d === 'cover') return this._coverText(st, level);
      if (d === 'switch' || d === 'input_boolean') return st.state === 'on' ? 'On' : st.state === 'off' ? 'Off' : this._genericText(st);
      return this._genericText(st);
    }

    _accentOf(eid, st) {
      const d = domainOf(eid);
      if (d === 'light' && st) return lightAccent(st) || ACCENTS.light;
      if (d === 'binary_sensor' && st) {
        const dc = st.attributes.device_class;
        if (['moisture', 'smoke', 'gas', 'safety', 'problem', 'carbon_monoxide'].includes(dc)) return 'var(--gh-alert)';
      }
      return ACCENTS[d] || 'var(--gh-neutral)';
    }

    _entityName(ent, st) {
      return ent.name || (st && st.attributes.friendly_name) || ent.entity;
    }

    /** Render (or update) the icon element for an entity inside `host`. Returns the icon element. */
    _renderIcon(host, ent, st, prev) {
      const active = isActive(st);
      const configured = (!active && ent.icon_off) || ent.icon;
      const key = configured ? `i:${configured}` : 's';
      let el = prev && prev.key === key ? prev.el : null;
      if (!el) {
        if (prev && prev.el) prev.el.remove();
        el = configured ? icon(configured) : document.createElement('ha-state-icon');
        host.prepend(el);
      }
      if (!configured) {
        el.hass = this._hass;
        el.stateObj = st;
      }
      return { el, key };
    }

    _updatePill(eid) {
      const pill = this._pills.get(eid);
      if (!pill) return;
      const st = this._hass.states[eid];
      const { ent, el } = pill;
      const name = this._entityName(ent, st);
      const unavailable = isUnavailable(st);
      const on = !unavailable && isActive(st);
      const d = domainOf(eid);

      pill.icon = this._renderIcon(pill.iconHost, ent, st, pill.icon);
      pill.nm.textContent = name;
      const text = this._stateText(eid, st);
      pill.st.textContent = text;

      el.classList.toggle('on', on);
      el.classList.toggle('unavail', unavailable);
      el.style.setProperty('--accent', this._accentOf(eid, st));

      const level = unavailable || !st ? null : this._levelOf(eid, st);
      el.classList.toggle('has-lvl', level !== null && level > 0);
      el.style.setProperty('--level', `${level || 0}%`);

      // a gently spinning fan icon (not for ceiling/side-view fan icons)
      const iconName = ent.icon || '';
      const spin = d === 'fan' && on && !/ceiling|off/.test(iconName);
      el.classList.toggle('spin', spin);
      if (spin) {
        const pct = level === null ? 50 : level;
        el.style.setProperty('--spin', `${(2.6 - (pct / 100) * 1.9).toFixed(2)}s`);
      }
      const alert = d === 'binary_sensor' && on && el.style.getPropertyValue('--accent').includes('alert');
      el.classList.toggle('alert', alert);

      el.setAttribute('aria-label', `${name}, ${text}`);
      if (TOGGLE_DOMAINS.has(d) && !unavailable) el.setAttribute('aria-pressed', String(on));
      else el.removeAttribute('aria-pressed');
      el.setAttribute('aria-disabled', String(unavailable));
      el.title = `${name}: ${text}`;
    }

    /* ------------------------------------------------------------ header */

    _sensorValue(id) {
      const st = id && this._hass.states[id];
      if (!st || !isNum(st.state)) return null;
      return { v: Number(st.state), unit: st.attributes.unit_of_measurement || '' };
    }

    _fmtTemp(t) {
      if (!t) return null;
      const decimals = /C/.test(t.unit) && Math.abs(t.v - Math.round(t.v)) >= 0.05 ? 1 : 0;
      return `${t.v.toFixed(decimals)}°`;
    }

    _updateHeader() {
      const c = this._config;
      let on = 0, open = 0;
      let roomAccent = null;
      for (const ent of c.entities) {
        const st = this._hass.states[ent.entity];
        const d = domainOf(ent.entity);
        if (!st || isUnavailable(st)) continue;
        if (d === 'cover') { if (isActive(st)) open += 1; continue; }
        if (ALL_OFF_DOMAINS.includes(d) && st.state === 'on') {
          on += 1;
          if (!roomAccent || (d === 'light' && !roomAccent.startsWith('var(--gh-light'))) {
            roomAccent = d === 'light' ? ACCENTS.light : (roomAccent || ACCENTS[d]);
          }
        }
      }
      const temp = this._fmtTemp(this._sensorValue(c.temperature));
      const humV = this._sensorValue(c.humidity);
      const hum = humV ? `${Math.round(humV.v)}%` : null;

      const s = this._summary;
      s.textContent = '';
      const parts = [];
      const hasControls = c.entities.some((e) => ALL_OFF_DOMAINS.includes(domainOf(e.entity)));
      if (on) parts.push([`${on} on`, 'n']);
      else if (hasControls) parts.push(['All off']);
      if (open) parts.push([`${open} open`, 'n']);
      if (temp) parts.push([temp]);
      if (hum) parts.push([hum]);
      parts.forEach(([txt, cls], i) => {
        if (i) s.append(document.createTextNode(' · '));
        s.append(cls ? h('span', { class: cls, text: txt }) : document.createTextNode(txt));
      });

      if (this._chips.temperature) {
        this._chips.temperature.val.textContent = temp || '–';
        this._chips.temperature.chip.setAttribute('aria-label', `Temperature ${temp || 'unavailable'}`);
      }
      if (this._chips.humidity) {
        this._chips.humidity.val.textContent = hum || '–';
        this._chips.humidity.chip.setAttribute('aria-label', `Humidity ${hum || 'unavailable'}`);
      }
      if (this._motion) {
        const m = this._hass.states[c.motion];
        const mOn = !!m && m.state === 'on';
        this._motion.classList.toggle('on', mOn);
        this._motion.hidden = !m || isUnavailable(m);
        this._motion.setAttribute('aria-label', mOn ? 'Motion detected' : 'No motion');
        this._motion.title = mOn ? 'Motion detected' : 'No motion';
      }
      this._roomIc.classList.toggle('on', on > 0 || open > 0);
      this._roomIc.style.setProperty('--room-accent', roomAccent || ACCENTS.cover);
      this._allOff.hidden = on === 0;
    }

    /* ------------------------------------------------------------- sheet */

    _openSheet(eid, scroll) {
      const ent = this._config.entities.find((e) => e.entity === eid);
      if (!ent) return;
      const st = this._hass.states[eid];
      if (isUnavailable(st)) { this._moreInfo(eid); return; }
      const swapping = !!this._sheet;
      if (this._sheet) this._pills.get(this._sheet.eid)?.el.classList.remove('sel');
      const sheet = this._buildSheet(ent);
      this._sheet = sheet;
      this._sheetClip.innerHTML = '';
      this._sheetClip.append(sheet.el);
      if (swapping) sheet.el.classList.add('swap');
      sheet.update();
      this._pills.get(eid)?.el.classList.add('sel');
      this._sheetWrap.classList.add('open');
      if (scroll) setTimeout(() => {
        if (this._sheet === sheet && typeof sheet.el.scrollIntoView === 'function') {
          sheet.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 300);
    }

    _closeSheet() {
      if (!this._sheet) return;
      const eid = this._sheet.eid;
      this._pills.get(eid)?.el.classList.remove('sel');
      this._sheet = null;
      this._sheetWrap.classList.remove('open');
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) this._sheetClip.innerHTML = '';
      this._pills.get(eid)?.el.focus({ preventScroll: true });
    }

    _buildSheet(ent, onClose) {
      const closeIt = onClose || (() => this._closeSheet());
      const eid = ent.entity;
      const d = domainOf(eid);
      const el = h('section', { class: 'sheet', role: 'region' });
      const head = h('div', { class: 'sh-head' });
      const icHost = h('span', { class: 'ic' });
      const name = h('div', { class: 'sh-name' });
      const state = h('div', { class: 'sh-state' });
      head.append(icHost, h('div', { class: 'sh-titles' }, [name, state]));
      const body = h('div', { class: 'sh-body' });
      const updaters = [];
      let iconRef = null;

      const st0 = this._hass.states[eid];
      let power = null;
      if (d === 'light' || d === 'fan') {
        power = h('button', { class: 'sw', type: 'button', role: 'switch' });
        power.addEventListener('click', () => {
          const st = this._hass.states[eid];
          this._call(d, st && st.state === 'on' ? 'turn_off' : 'turn_on', { entity_id: eid });
          this._haptic('light');
        });
        head.append(power);
      }
      const close = h('button', { class: 'close', type: 'button', 'aria-label': 'Close controls' }, [icon('mdi:close')]);
      close.addEventListener('click', () => closeIt());
      head.append(close);

      if (d === 'light') this._lightControls(eid, st0, body, updaters);
      else if (d === 'fan') this._fanControls(eid, st0, body, updaters);
      else if (d === 'cover') this._coverControls(eid, st0, body, updaters);
      else if (d === 'switch' || d === 'input_boolean') this._toggleControls(eid, body, updaters);
      else this._readoutControls(eid, body, updaters);
      if (ent.controls && ent.controls.length) this._extraControls(ent.controls, body, updaters);

      const more = h('button', { class: 'more', type: 'button' }, [document.createTextNode('More…'), icon('mdi:chevron-right')]);
      more.addEventListener('click', () => this._moreInfo(eid));
      const foot = h('div', { class: 'sh-foot' }, [more]);
      el.append(head);
      if (body.childNodes.length) el.append(body);
      el.append(foot);

      const update = () => {
        const st = this._hass.states[eid];
        if (isUnavailable(st)) { closeIt(); return; }
        const on = isActive(st);
        const label = this._entityName(ent, st);
        el.classList.toggle('on', on);
        el.style.setProperty('--accent', this._accentOf(eid, st));
        el.setAttribute('aria-label', `${label} controls`);
        name.textContent = label;
        state.textContent = this._stateText(eid, st);
        iconRef = this._renderIcon(icHost, ent, st, iconRef);
        more.setAttribute('aria-label', `More information about ${label}`);
        if (power) {
          power.setAttribute('aria-checked', String(st.state === 'on'));
          power.setAttribute('aria-label', `${label} power`);
        }
        updaters.forEach((fn) => fn(st));
      };
      return { eid, el, update };
    }

    /** A labelled range slider that updates locally while dragging and commits on release. */
    _slider({ eid, key, label, min, max, step, cls, format, commit, read, ticks, toUi = (v) => v, fromUi = (v) => v }) {
      const wrap = h('div', { class: 'ctl' });
      const lab = h('span', { class: 'ctl-label', text: label });
      const val = h('span', { class: 'ctl-val' });
      const input = h('input', { type: 'range', min, max, step, class: cls || null, 'aria-label': label });
      wrap.append(h('div', { class: 'ctl-row' }, [lab, val]), input);
      let tickEls = null;
      if (ticks) {
        const row = h('div', { class: 'ticks', 'aria-hidden': 'true' });
        tickEls = ticks.map((t) => {
          const s = h('span', { text: t.label });
          s.style.setProperty('--t', String((t.value - min) / (max - min)));
          row.append(s);
          return { s, value: t.value };
        });
        wrap.append(row);
      }
      let dragging = false;
      const paint = (v) => {
        const p = max > min ? (v - min) / (max - min) : 0;
        input.style.setProperty('--p', String(clamp(p, 0, 1)));
        input.style.setProperty('--f', p > 0 ? '1' : '0');
        val.textContent = format(v);
        input.setAttribute('aria-valuetext', format(v));
        if (tickEls) tickEls.forEach((t) => t.s.classList.toggle('cur', t.value === Math.round(v)));
      };
      input.addEventListener('input', () => { dragging = true; paint(Number(input.value)); });
      input.addEventListener('change', () => {
        dragging = false;
        const v = Number(input.value);
        const canon = fromUi(v);
        this._setTarget(eid, key, canon);
        paint(v);
        commit(canon);
        this._refresh(eid);
      });
      input.addEventListener('blur', () => { dragging = false; });
      const set = (st) => {
        if (dragging) return;
        const shown = clamp(toUi(this._shown(eid, key, read(st))), min, max);
        input.value = String(shown);
        paint(shown);
      };
      return { wrap, input, set, setDim: (dim) => wrap.classList.toggle('dim', dim) };
    }

    _lightControls(eid, st, body, updaters) {
      const caps = lightCaps(st);
      if (caps.dimmable) {
        const s = this._slider({
          eid, key: 'brightness', label: 'Brightness', min: 0, max: 100, step: 1,
          format: (v) => (v > 0 ? `${Math.round(v)}%` : 'Off'),
          read: (x) => brightnessPct(x),
          commit: (v) => {
            if (v <= 0) this._call('light', 'turn_off', { entity_id: eid });
            else this._call('light', 'turn_on', { entity_id: eid, brightness_pct: Math.round(v) });
          },
        });
        body.append(s.wrap);
        updaters.push(s.set);
      }
      if (caps.temp) {
        const { min, max } = kelvinRange(st);
        const s = this._slider({
          eid, key: 'kelvin', label: 'Color temperature', min, max, step: 50, cls: 'kelvin',
          format: (v) => `${Math.round(v)} K`,
          read: (x) => {
            const k = kelvinOf(x);
            return k === null ? Math.round((min + max) / 2) : clamp(k, min, max);
          },
          commit: (v) => this._call('light', 'turn_on', { entity_id: eid, color_temp_kelvin: Math.round(v) }),
        });
        body.append(s.wrap);
        updaters.push((x) => { s.set(x); s.setDim(x.state !== 'on' || x.attributes.color_mode !== 'color_temp'); });
      }
      if (caps.color) {
        const s = this._slider({
          eid, key: 'hue', label: 'Color', min: 0, max: 360, step: 1, cls: 'hue',
          format: (v) => `${Math.round(v)}°`,
          read: (x) => (Array.isArray(x.attributes.hs_color) ? Number(x.attributes.hs_color[0]) : 30),
          commit: (v) => this._call('light', 'turn_on', { entity_id: eid, hs_color: [Math.round(v), 100] }),
        });
        body.append(s.wrap);
        updaters.push((x) => { s.set(x); s.setDim(x.state !== 'on' || !COLOR_MODES.has(x.attributes.color_mode)); });
      }
      if (!caps.dimmable && !caps.temp && !caps.color) this._toggleControls(eid, body, updaters);
    }

    _fanControls(eid, st, body, updaters) {
      if (fanSupportsSpeed(st)) {
        const n = fanSteps(st);
        const stepped = n <= 10;
        const s = this._slider({
          eid, key: 'percentage', label: 'Speed',
          min: 0, max: stepped ? n : 100, step: 1,
          format: (v) => (stepped ? (v > 0 ? `${Math.round(v)} of ${n}` : 'Off') : (v > 0 ? `${Math.round(v)}%` : 'Off')),
          read: (x) => (x.state === 'on' ? (isNum(x.attributes.percentage) ? Number(x.attributes.percentage) : 100) : 0),
          toUi: stepped ? (pct) => Math.round((pct / 100) * n) : (pct) => Math.round(pct),
          fromUi: stepped ? (v) => Math.min(100, Math.round((v * 100) / n)) : (v) => v,
          ticks: stepped ? Array.from({ length: n + 1 }, (_, i) => ({ value: i, label: i === 0 ? 'Off' : String(i) })) : null,
          commit: (pct) => {
            if (pct <= 0) this._call('fan', 'turn_off', { entity_id: eid });
            else this._call('fan', 'set_percentage', { entity_id: eid, percentage: pct });
          },
        });
        body.append(s.wrap);
        updaters.push(s.set);
      }
      const sf = Number(st.attributes.supported_features) || 0;
      const btns = [];
      const ownCtl = this._config.entities.find((x) => x.entity === eid);
      if (!(ownCtl && ownCtl.controls.length) && ((sf & FAN_OSCILLATE) || st.attributes.oscillating !== undefined)) {
        const b = h('button', { class: 'btn', type: 'button' }, [icon('mdi:arrow-oscillating'), h('span', { text: 'Oscillate' })]);
        b.addEventListener('click', () => {
          const x = this._hass.states[eid];
          this._call('fan', 'oscillate', { entity_id: eid, oscillating: !x.attributes.oscillating });
          this._haptic('light');
        });
        btns.push(b);
        updaters.push((x) => b.setAttribute('aria-pressed', String(!!x.attributes.oscillating)));
      }
      if ((sf & FAN_DIRECTION) || st.attributes.direction !== undefined) {
        const label = h('span');
        const ic = icon('mdi:rotate-right');
        const b = h('button', { class: 'btn', type: 'button' }, [ic, label]);
        b.addEventListener('click', () => {
          const x = this._hass.states[eid];
          const next = x.attributes.direction === 'reverse' ? 'forward' : 'reverse';
          this._call('fan', 'set_direction', { entity_id: eid, direction: next });
          this._haptic('light');
        });
        btns.push(b);
        updaters.push((x) => {
          const rev = x.attributes.direction === 'reverse';
          label.textContent = rev ? 'Reverse' : 'Forward';
          const name = rev ? 'mdi:rotate-left' : 'mdi:rotate-right';
          ic.setAttribute('icon', name); ic.icon = name;
          b.setAttribute('aria-label', `Direction: ${rev ? 'reverse' : 'forward'}. Tap to switch.`);
        });
      }
      if (btns.length) body.append(h('div', { class: 'btns' }, btns));
      if (!fanSupportsSpeed(st) && !btns.length) this._toggleControls(eid, body, updaters);
    }

    _coverControls(eid, st, body, updaters) {
      if (coverHasPosition(st)) {
        const s = this._slider({
          eid, key: 'position', label: 'Position', min: 0, max: 100, step: 1,
          format: (v) => (v <= 0 ? 'Closed' : v >= 100 ? 'Open' : `${Math.round(v)}% open`),
          read: (x) => (isNum(x.attributes.current_position) ? Number(x.attributes.current_position) : (x.state === 'closed' ? 0 : 100)),
          commit: (v) => this._call('cover', 'set_cover_position', { entity_id: eid, position: Math.round(v) }),
        });
        body.append(s.wrap);
        updaters.push(s.set);
      }
      const defs = [
        ['open_cover', 'Open', 'mdi:arrow-up', COVER_OPEN],
        ['stop_cover', 'Stop', 'mdi:stop', COVER_STOP],
        ['close_cover', 'Close', 'mdi:arrow-down', COVER_CLOSE],
      ].filter(([, , , bit]) => coverSupports(st, bit));
      if (defs.length) {
        const row = h('div', { class: 'btns' });
        const map = {};
        for (const [svc, label, ic] of defs) {
          const b = h('button', { class: 'btn', type: 'button', 'aria-label': `${label}` }, [icon(ic), h('span', { text: label })]);
          b.addEventListener('click', () => { this._call('cover', svc, { entity_id: eid }); this._haptic('light'); });
          row.append(b);
          map[svc] = b;
        }
        body.append(row);
        updaters.push((x) => {
          const pos = isNum(x.attributes.current_position) ? Number(x.attributes.current_position) : null;
          const moving = x.state === 'opening' || x.state === 'closing';
          if (map.open_cover) map.open_cover.disabled = !moving && (x.state === 'open' && (pos === null || pos >= 100));
          if (map.close_cover) map.close_cover.disabled = !moving && x.state === 'closed';
          if (map.stop_cover) map.stop_cover.setAttribute('aria-pressed', 'false');
          if (map.open_cover) map.open_cover.setAttribute('aria-pressed', String(x.state === 'opening'));
          if (map.close_cover) map.close_cover.setAttribute('aria-pressed', String(x.state === 'closing'));
        });
      }
    }

    _toggleControls(eid, body, updaters) {
      const d = domainOf(eid);
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Power' });
      const off = h('button', { type: 'button' }, [icon('mdi:power-off'), h('span', { text: 'Off' })]);
      const on = h('button', { type: 'button', class: 'on' }, [icon('mdi:power'), h('span', { text: 'On' })]);
      off.addEventListener('click', () => { this._call(d, 'turn_off', { entity_id: eid }); this._haptic('light'); });
      on.addEventListener('click', () => { this._call(d, 'turn_on', { entity_id: eid }); this._haptic('light'); });
      seg.append(off, on);
      body.append(seg);
      updaters.push((x) => {
        on.setAttribute('aria-pressed', String(x.state === 'on'));
        off.setAttribute('aria-pressed', String(x.state !== 'on'));
      });
    }

    /** Related on/off entities shown as toggle buttons (e.g. a fan's horizontal / vertical oscillation switches). */
    _extraControls(controls, body, updaters) {
      // lights (e.g. smart bulbs behind a wall switch): a section per light with its own power switch and sliders
      for (const c of controls.filter((x) => domainOf(x.entity) === 'light')) {
        const st = this._hass.states[c.entity] || { state: 'unavailable', attributes: {} };
        const label = h('span', { class: 'subl-name' });
        const stateTx = h('span', { class: 'subl-state' });
        const sw = h('button', { class: 'sw', type: 'button', role: 'switch' });
        sw.addEventListener('click', () => {
          const x = this._hass.states[c.entity];
          if (isUnavailable(x)) return;
          this._call('light', x.state === 'on' ? 'turn_off' : 'turn_on', { entity_id: c.entity });
          this._haptic('light');
        });
        const sec = h('div', { class: 'subl' }, [h('div', { class: 'subl-h' }, [h('span', { class: 'subl-t' }, [label, stateTx]), sw])]);
        const own = [];
        const caps = lightCaps(st);
        if (caps.dimmable || caps.temp || caps.color) this._lightControls(c.entity, st, sec, own);
        body.append(sec);
        updaters.push(() => {
          const x = this._hass.states[c.entity];
          const dead = isUnavailable(x);
          const nm = c.name || (x && x.attributes.friendly_name) || c.entity;
          label.textContent = nm;
          stateTx.textContent = dead ? 'Starting up…' : x.state === 'on' ? (isNum(brightnessPct(x)) && brightnessPct(x) > 0 ? `${Math.round(brightnessPct(x))}%` : 'On') : 'Off';
          sw.setAttribute('aria-checked', String(!dead && x.state === 'on'));
          sw.setAttribute('aria-label', `${nm} power`);
          sw.disabled = dead;
          sec.style.setProperty('--accent', dead ? 'var(--gh-text-2)' : this._accentOf(c.entity, x));
          sec.classList.toggle('dead', dead);
          for (const inp of sec.querySelectorAll('input')) inp.disabled = dead;
          if (!dead) own.forEach((fn) => fn(x));
        });
      }
      controls = controls.filter((x) => domainOf(x.entity) !== 'light');
      // number / input_number controls become sliders (e.g. a tablet's screen brightness)
      for (const c of controls.filter((x) => NUMBER_DOMAINS.has(domainOf(x.entity)))) {
        const st = this._hass.states[c.entity];
        const a = (st && st.attributes) || {};
        const min = isNum(a.min) ? Number(a.min) : 0;
        const max = isNum(a.max) ? Number(a.max) : 100;
        const step = isNum(a.step) ? Number(a.step) : 1;
        const unit = a.unit_of_measurement ? ` ${a.unit_of_measurement}` : '';
        const s = this._slider({
          eid: c.entity, key: 'value', label: c.name || a.friendly_name || c.entity, min, max, step,
          format: (v) => `${Math.round(v * 100) / 100}${unit}`,
          read: (x) => (x && isNum(x.state) ? Number(x.state) : min),
          commit: (v) => this._call(domainOf(c.entity), 'set_value', { entity_id: c.entity, value: v }),
        });
        body.append(s.wrap);
        updaters.push(() => {
          const x = this._hass.states[c.entity];
          s.setDim(isUnavailable(x));
          s.input.disabled = isUnavailable(x);
          if (!isUnavailable(x)) s.set(x);
        });
      }
      const toggles = controls.filter((x) => !NUMBER_DOMAINS.has(domainOf(x.entity)));
      if (!toggles.length) return;
      const btns = toggles.map((c) => {
        const label = h('span');
        const ic = h('span', { class: 'xic' });
        const b = h('button', { class: 'btn', type: 'button' }, [ic, label]);
        let iconRef = null;
        b.addEventListener('click', () => {
          const x = this._hass.states[c.entity];
          if (isUnavailable(x)) return;
          const d = domainOf(c.entity);
          if (d === 'button' || d === 'input_button') this._call(d, 'press', { entity_id: c.entity });
          else if (d === 'script' || d === 'scene') this._call(d, 'turn_on', { entity_id: c.entity });
          else this._call(TOGGLE_DOMAINS.has(d) ? d : 'homeassistant', 'toggle', { entity_id: c.entity });
          this._haptic('light');
        });
        updaters.push(() => {
          const x = this._hass.states[c.entity];
          const on = !!x && x.state === 'on';
          label.textContent = c.name || (x && x.attributes.friendly_name) || c.entity;
          b.setAttribute('aria-pressed', String(on));
          b.disabled = isUnavailable(x);
          iconRef = this._renderIcon(ic, { entity: c.entity, icon: c.icon }, x, iconRef);
        });
        return b;
      });
      body.append(h('div', { class: 'btns xbtns' }, btns));
    }

    _readoutControls(eid, body, updaters) {
      const r = h('div', { class: 'readout' });
      body.append(r);
      updaters.push((x) => {
        r.textContent = '';
        if (isNum(x.state)) {
          r.append(document.createTextNode(String(Number(x.state))));
          if (x.attributes.unit_of_measurement) r.append(h('small', { text: x.attributes.unit_of_measurement }));
        } else {
          r.textContent = this._genericText(x);
        }
      });
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, GlasshouseRoomCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: TAG,
      name: 'Glasshouse Room Card',
      description: 'A room tile with full control of every light, switch, fan and cover in the room.',
      preview: true,
      documentationURL: 'https://github.com/petergCA/glasshouse-room-card',
    });
    console.info(
      `%c GLASSHOUSE-ROOM-CARD %c v${VERSION} `,
      'color:#0a0f18;background:#ffb547;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px',
      'color:#e9eef6;background:#1b2333;font-weight:600;border-radius:0 4px 4px 0;padding:2px 4px',
    );
  }
})();
