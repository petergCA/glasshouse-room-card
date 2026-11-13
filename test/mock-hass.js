/* Mock Home Assistant `hass` for the Glasshouse room card harness and node tests.
 * Generic demo data only. callService mutates the mock state (new state object per change,
 * like HA) and hands a fresh hass object to every subscriber. */
(function (root) {
  'use strict';

  const FAN_6 = 100 / 6;

  function s(entity_id, state, attributes) {
    return {
      entity_id, state, attributes: attributes || {},
      last_changed: '2026-01-01T00:00:00Z', last_updated: '2026-01-01T00:00:00Z', context: { id: 'x' },
    };
  }

  function demoStates() {
    const list = [
      // Living room
      s('sensor.lr_temperature', '71.2', { unit_of_measurement: '°F', device_class: 'temperature' }),
      s('sensor.lr_humidity', '42', { unit_of_measurement: '%', device_class: 'humidity' }),
      s('binary_sensor.lr_motion', 'on', { device_class: 'motion' }),
      s('light.lr_ceiling', 'on', { friendly_name: 'Ceiling', brightness: 173, color_mode: 'color_temp',
        color_temp_kelvin: 2700, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500,
        supported_color_modes: ['color_temp'], supported_features: 40 }),
      s('light.lr_strip', 'on', { friendly_name: 'Accent Strip', brightness: 204, color_mode: 'hs',
        rgb_color: [138, 112, 255], hs_color: [250, 56], supported_color_modes: ['color_temp', 'hs'],
        min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }),
      s('light.lr_floor', 'off', { friendly_name: 'Floor Lamp', supported_color_modes: ['brightness'] }),
      s('fan.lr_ceiling', 'on', { friendly_name: 'Ceiling Fan', percentage: 33, percentage_step: FAN_6,
        direction: 'forward', supported_features: 1 | 4 | 16 | 32 }),
      s('cover.lr_blinds', 'open', { friendly_name: 'Blinds', current_position: 40, device_class: 'blind',
        supported_features: 15 }),
      s('switch.lr_lamp', 'on', { friendly_name: 'Reading Lamp' }),
      s('switch.lr_soundbar', 'off', { friendly_name: 'Sound Bar Power' }),
      s('switch.lr_heater', 'unavailable', { friendly_name: 'Space Heater' }),

      // Bedroom (everything off)
      s('sensor.br_temperature', '68.4', { unit_of_measurement: '°F', device_class: 'temperature' }),
      s('binary_sensor.br_motion', 'off', { device_class: 'motion' }),
      s('light.br_ceiling', 'off', { friendly_name: 'Ceiling Light', supported_color_modes: ['brightness'] }),
      s('light.br_left', 'off', { friendly_name: 'Left Nightstand Lamp', supported_color_modes: ['color_temp'],
        min_color_temp_kelvin: 2200, max_color_temp_kelvin: 4000 }),
      s('light.br_right', 'off', { friendly_name: 'Right Nightstand Lamp', supported_color_modes: ['onoff'] }),
      s('fan.br_tower', 'off', { friendly_name: 'Tower Fan', percentage: 0, percentage_step: 100 / 3,
        oscillating: false, supported_features: 1 | 2 | 16 | 32 }),
      s('cover.br_shade', 'closed', { friendly_name: 'Blackout Shade', current_position: 0, supported_features: 15 }),
      s('input_boolean.br_sleep', 'off', { friendly_name: 'Sleep Mode' }),

      // Kitchen
      s('sensor.k_temperature', '22.6', { unit_of_measurement: '°C', device_class: 'temperature' }),
      s('sensor.k_humidity', '51.4', { unit_of_measurement: '%', device_class: 'humidity' }),
      s('light.k_pendants', 'on', { friendly_name: 'Island Pendants', brightness: 255, color_mode: 'brightness',
        supported_color_modes: ['brightness'] }),
      s('light.k_cans', 'on', { friendly_name: 'Recessed', brightness: 115, color_mode: 'color_temp',
        color_temp_kelvin: 4000, supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2700,
        max_color_temp_kelvin: 6500 }),
      s('light.k_under', 'off', { friendly_name: 'Under Cabinet', supported_color_modes: ['onoff'] }),
      s('switch.k_coffee', 'on', { friendly_name: 'Coffee Maker' }),
      s('switch.k_disposal', 'off', { friendly_name: 'Disposal' }),
      s('fan.k_hood', 'on', { friendly_name: 'Range Hood', percentage: 50, percentage_step: 25,
        supported_features: 1 | 16 | 32 }),
      s('input_boolean.k_guest', 'on', { friendly_name: 'Guest Mode' }),
      s('sensor.k_dishwasher', '3.2', { friendly_name: 'Dishwasher Power', unit_of_measurement: 'W',
        device_class: 'power' }),
      s('binary_sensor.k_leak', 'off', { friendly_name: 'Sink Leak', device_class: 'moisture' }),
    ];
    const states = {};
    for (const x of list) states[x.entity_id] = x;
    return states;
  }

  function createHass(initialStates, opts) {
    const subscribers = new Set();
    const calls = [];
    let states = initialStates || demoStates();
    const instant = !(opts && opts.delay);

    function commit(id, mutate) {
      const prev = states[id];
      if (!prev) return;
      const next = { ...prev, attributes: { ...prev.attributes }, last_updated: new Date().toISOString() };
      mutate(next, next.attributes);
      states = { ...states, [id]: next };
      publish();
    }

    function publish() {
      const hass = makeHass();
      api.current = hass;
      subscribers.forEach((fn) => fn(hass));
    }

    function apply(domain, service, data) {
      const ids = [].concat(data.entity_id || []);
      for (const id of ids) {
        commit(id, (st, a) => {
          const on = st.state === 'on';
          const turnOn = () => { st.state = 'on'; };
          const turnOff = () => { st.state = 'off'; };
          if (domain === 'cover') {
            const setPos = (p) => { a.current_position = p; st.state = p > 0 ? 'open' : 'closed'; };
            if (service === 'toggle') setPos(st.state === 'closed' ? 100 : 0);
            if (service === 'open_cover') setPos(100);
            if (service === 'close_cover') setPos(0);
            if (service === 'set_cover_position') setPos(data.position);
            return;
          }
          if (service === 'toggle') (on ? turnOff : turnOn)();
          if (service === 'turn_off') turnOff();
          if (service === 'turn_on') turnOn();
          if (domain === 'light') {
            if (st.state === 'off') { a.brightness = null; return; }
            if (data.brightness_pct !== undefined) a.brightness = Math.round((data.brightness_pct / 100) * 255);
            else if (a.brightness == null && (a.supported_color_modes || []).some((m) => m !== 'onoff')) a.brightness = 255;
            if (data.color_temp_kelvin !== undefined) { a.color_temp_kelvin = data.color_temp_kelvin; a.color_mode = 'color_temp'; }
          }
          if (domain === 'fan') {
            if (service === 'set_percentage') {
              a.percentage = data.percentage;
              st.state = data.percentage > 0 ? 'on' : 'off';
            } else if (st.state === 'on' && !a.percentage) a.percentage = a.percentage_step || 100;
            if (st.state === 'off') a.percentage = 0;
            if (service === 'oscillate') a.oscillating = data.oscillating;
            if (service === 'set_direction') a.direction = data.direction;
          }
        });
      }
    }

    function makeHass() {
      return {
        states,
        user: { name: 'Demo' },
        language: 'en',
        callService(domain, service, data) {
          calls.push({ domain, service, data: JSON.parse(JSON.stringify(data || {})) });
          if (instant) apply(domain, service, data || {});
          else setTimeout(() => apply(domain, service, data || {}), opts.delay);
          return Promise.resolve();
        },
      };
    }

    const api = {
      calls,
      current: makeHass(),
      subscribe(fn) { subscribers.add(fn); fn(api.current); return () => subscribers.delete(fn); },
      setState(id, state, attrs) { commit(id, (st, a) => { st.state = state; Object.assign(a, attrs || {}); }); },
    };
    return api;
  }

  root.GHMock = { demoStates, createHass };
})(typeof window !== 'undefined' ? window : globalThis);
