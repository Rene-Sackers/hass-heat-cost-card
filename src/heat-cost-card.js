/* Heat cost card: cost per kWh of heat from gas, resistive heaters and aircon. */

const DEFAULTS = {
  title: "Heating cost per kWh of heat",
  currency: "€",
  boiler_efficiency: 90,
  gas_kwh_per_m3: 9.77,
  cop_at_7c: 3.2,
  cop_per_degree: 0.12,
  cop_min: 1.5,
  cop_max: 5,
};

const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { name: "gas_price_entity", required: true, selector: { entity: { domain: ["sensor", "input_number"] } } },
  { name: "electricity_price_entity", required: true, selector: { entity: { domain: ["sensor", "input_number"] } } },
  { name: "outside_temp_entity", required: true, selector: { entity: { domain: ["sensor", "input_number"], device_class: "temperature" } } },
  { name: "currency", selector: { text: {} } },
  { name: "boiler_efficiency", selector: { number: { min: 50, max: 110, step: 1, unit_of_measurement: "%", mode: "box" } } },
  { name: "gas_kwh_per_m3", selector: { number: { min: 5, max: 14, step: 0.01, unit_of_measurement: "kWh/m³", mode: "box" } } },
  { name: "cop_at_7c", selector: { number: { min: 1, max: 8, step: 0.1, mode: "box" } } },
  { name: "cop_per_degree", selector: { number: { min: 0, max: 0.5, step: 0.01, mode: "box" } } },
  { name: "cop_min", selector: { number: { min: 1, max: 5, step: 0.1, mode: "box" } } },
  { name: "cop_max", selector: { number: { min: 1, max: 8, step: 0.1, mode: "box" } } },
];

const LABELS = {
  title: "Title",
  gas_price_entity: "Gas price entity",
  electricity_price_entity: "Electricity price entity",
  outside_temp_entity: "Outside temperature entity",
  currency: "Currency symbol",
  boiler_efficiency: "Boiler efficiency",
  gas_kwh_per_m3: "Gas energy content",
  cop_at_7c: "Aircon COP at 7°C",
  cop_per_degree: "COP change per °C",
  cop_min: "Minimum COP",
  cop_max: "Maximum COP",
};

class HeatCostCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: SCHEMA,
      computeLabel: (s) => LABELS[s.name] || s.name,
    };
  }

  static getStubConfig() {
    return {
      gas_price_entity: "sensor.gas_price",
      electricity_price_entity: "sensor.electricity_price",
      outside_temp_entity: "sensor.outside_temperature",
    };
  }

  setConfig(config) {
    for (const k of ["gas_price_entity", "electricity_price_entity", "outside_temp_entity"]) {
      if (!config[k]) throw new Error(`Missing ${k}`);
    }
    this._config = { ...DEFAULTS, ...config };
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._update();
  }

  getCardSize() {
    return 3;
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .wrap{padding:0 16px 16px}
        .row{display:grid;grid-template-columns:96px minmax(0,1fr) 76px;align-items:center;gap:10px;margin:10px 0}
        .name{font-size:14px;color:var(--primary-text-color);min-width:0}
        .name small{display:block;font-size:12px;color:var(--secondary-text-color)}
        .bar{height:26px;border-radius:5px;background:var(--secondary-background-color);overflow:hidden}
        .fill{height:100%;border-radius:5px;box-sizing:border-box;transition:width .3s}
        .val{text-align:right;font-size:14px;color:var(--primary-text-color);font-variant-numeric:tabular-nums;white-space:nowrap}
        .best{font-weight:600}
        .msg{color:var(--secondary-text-color);font-size:14px;padding:8px 0}
      </style>
      <ha-card header="${this._esc(this._config.title)}"><div class="wrap" id="body"></div></ha-card>`;
  }

  _esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  _num(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return { error: `${entityId} not found` };
    const v = parseFloat(st.state);
    if (Number.isNaN(v)) return { error: `${entityId} is ${st.state}` };
    return { v, unit: (st.attributes.unit_of_measurement || "").trim() };
  }

  _update() {
    const c = this._config;
    const body = this.shadowRoot.getElementById("body");
    const gasIn = this._num(c.gas_price_entity);
    const elecIn = this._num(c.electricity_price_entity);
    const tempIn = this._num(c.outside_temp_entity);
    const err = gasIn.error || elecIn.error || tempIn.error;
    if (err) {
      body.innerHTML = `<div class="msg">${this._esc(err)}</div>`;
      return;
    }

    // Electricity as currency per kWh (accepts ct/kWh too)
    let elec = elecIn.v;
    if (/^(ct|c|cent)/i.test(elecIn.unit)) elec /= 100;

    // Gas as currency per kWh of fuel (accepts per-kWh sensors too)
    let gasFuel = /kwh/i.test(gasIn.unit) ? gasIn.v : gasIn.v / c.gas_kwh_per_m3;
    if (/^(ct|c|cent)/i.test(gasIn.unit)) gasFuel /= 100;

    const tempC = /f/i.test(tempIn.unit) ? ((tempIn.v - 32) * 5) / 9 : tempIn.v;
    const cop = Math.max(c.cop_min, Math.min(c.cop_max, c.cop_at_7c + c.cop_per_degree * (tempC - 7)));

    const opts = [
      { n: "Gas", v: gasFuel / (c.boiler_efficiency / 100), color: "var(--warning-color, #ff9800)", sub: "" },
      { n: "Resistive", v: elec, color: "var(--error-color, #db4437)", sub: "" },
      { n: "Aircon", v: elec / cop, color: "var(--info-color, #039be5)", sub: `COP ${cop.toFixed(1)} at ${tempC.toFixed(0)}°C` },
    ];
    const min = Math.min(...opts.map((o) => o.v));
    const max = Math.max(...opts.map((o) => o.v)) * 1.05;
    const fmt = (v) => (c.currency === "€" ? `${(v * 100).toFixed(1)} ct` : `${c.currency}${v.toFixed(3)}`);

    body.innerHTML = opts
      .map((o) => {
        const best = o.v === min;
        return `<div class="row">
          <div class="name ${best ? "best" : ""}">${o.n}${o.sub ? `<small>${o.sub}</small>` : ""}</div>
          <div class="bar"><div class="fill" style="width:${(o.v / max) * 100}%;background:${o.color};opacity:${best ? 1 : 0.55};${best ? `outline:2px solid ${o.color};outline-offset:-2px` : ""}"></div></div>
          <div class="val ${best ? "best" : ""}">${fmt(o.v)}${best ? " ✓" : ""}</div>
        </div>`;
      })
      .join("");
  }
}

customElements.define("heat-cost-card", HeatCostCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "heat-cost-card",
  name: "Heat cost card",
  description: "Cost per kWh of heat from gas, resistive heaters and aircon.",
});
