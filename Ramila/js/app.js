(function () {
  const STORAGE_KEY = "soilcrop_openrouter_key";

  const form = document.getElementById("npk-form");
  const submitBtn = document.getElementById("submit-btn");
  const btnText = submitBtn.querySelector(".btn-text");
  const btnLoader = submitBtn.querySelector(".btn-loader");
  const apiKeyInput = document.getElementById("api-key");
  const placeholder = document.getElementById("output-placeholder");
  const errorEl = document.getElementById("output-error");
  const resultEl = document.getElementById("output-result");
  const cropNameEl = document.getElementById("crop-name");
  const cropDetailsEl = document.getElementById("crop-details");
  const sensorStatusEl = document.getElementById("sensor-status");
  const sensorStatusText = document.getElementById("sensor-status-text");
  const sensorConnectBtn = document.getElementById("sensor-connect-btn");
  const sensorDisconnectBtn = document.getElementById("sensor-disconnect-btn");
  const autoAnalyzeCheckbox = document.getElementById("auto-analyze");
  const sensorLastReadingEl = document.getElementById("sensor-last-reading");
  const nitrogenInput = document.getElementById("nitrogen");
  const phosphorusInput = document.getElementById("phosphorus");
  const potassiumInput = document.getElementById("potassium");

  let lastSensorKey = "";
  let analyzeInFlight = false;
  let manualOverrideUntil = 0;

  function isManualOverrideActive() {
    return Date.now() < manualOverrideUntil;
  }

  function enableManualOverride(seconds = 20) {
    manualOverrideUntil = Date.now() + seconds * 1000;
  }

  function initApiKey() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const fromConfig = typeof CONFIG !== "undefined" && CONFIG.OPENROUTER_API_KEY;
    apiKeyInput.value = saved || fromConfig || "";
  }

  function getApiKey() {
    const key = apiKeyInput.value.trim() || (typeof CONFIG !== "undefined" && CONFIG.OPENROUTER_API_KEY) || "";
    if (key) localStorage.setItem(STORAGE_KEY, key);
    return key;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    btnText.hidden = loading;
    btnLoader.hidden = !loading;
  }

  function showPlaceholder() {
    placeholder.hidden = false;
    errorEl.hidden = true;
    resultEl.hidden = true;
  }

  function showError(message) {
    placeholder.hidden = true;
    resultEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function showResult(data) {
    placeholder.hidden = true;
    errorEl.hidden = true;
    resultEl.hidden = false;

    cropNameEl.textContent = data.best_crop || "Unknown crop";

    const alts = Array.isArray(data.alternative_crops) ? data.alternative_crops : [];
    const altHtml = alts.length
      ? `<h4>Also suitable</h4><div class="alt-crops">${alts.map((c) => `<span class="alt-crop-tag">${escapeHtml(c)}</span>`).join("")}</div>`
      : "";

    const fertilizers = Array.isArray(data.fertilizers) ? data.fertilizers : [];
    const fertilizerHtml = fertilizers.length
      ? `<h4>Fertilizers (Pakistan market)</h4>
         <p class="fertilizer-intro">${escapeHtml(data.fertilizer_summary || "Products commonly sold at Pakistani agri-dealers (Engro, FFC, Fatima, Fauji, etc.).")}</p>
         <div class="fertilizer-grid">${fertilizers.map(renderFertilizerCard).join("")}</div>`
      : "";

    cropDetailsEl.innerHTML = `
      <p><strong>Why this crop:</strong> ${escapeHtml(data.reasoning || "—")}</p>
      <h4>Soil match</h4>
      <p>${escapeHtml(data.soil_match || "—")}</p>
      ${fertilizerHtml}
      <h4>Growing tips</h4>
      <ul>${(data.tips || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("") || "<li>—</li>"}</ul>
      ${altHtml}
    `;
  }

  function renderFertilizerCard(f) {
    const typeClass = fertilizerTypeClass(f.type);
    return `
      <article class="fertilizer-card">
        <div class="fertilizer-card-head">
          <span class="fertilizer-type ${typeClass}">${escapeHtml(f.type || "NPK")}</span>
          <h5>${escapeHtml(f.brand_name || f.name || "—")}</h5>
        </div>
        <p class="fertilizer-purpose">${escapeHtml(f.purpose || "—")}</p>
        <dl class="fertilizer-meta">
          <div><dt>Dose</dt><dd>${escapeHtml(f.dose || "—")}</dd></div>
          <div><dt>When</dt><dd>${escapeHtml(f.timing || "—")}</dd></div>
        </dl>
        ${f.note ? `<p class="fertilizer-note">${escapeHtml(f.note)}</p>` : ""}
      </article>
    `;
  }

  function fertilizerTypeClass(type) {
    const t = String(type || "").toLowerCase();
    if (t.includes("nitrogen") || t === "n") return "ftype-n";
    if (t.includes("phosph") || t === "p") return "ftype-p";
    if (t.includes("potass") || t === "k") return "ftype-k";
    if (t.includes("npk") || t.includes("compound") || t.includes("blend")) return "ftype-npk";
    return "ftype-other";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function buildPrompt(n, p, k) {
    return `You are an expert agronomist advising farmers in Pakistan. Based on these soil nutrient levels, recommend the single best crop to plant AND fertilizers available in the Pakistani market.

Soil test values (mg/kg from NPK sensor):
- Nitrogen (N): ${n} mg/kg
- Phosphorus (P): ${p} mg/kg
- Potassium (K): ${k} mg/kg

For fertilizers, use REAL brand/product names sold in Pakistan, such as:
- Urea: Engro Urea, Sona Urea (FFC), Sarsabz Urea (Fatima), Pakarab Urea
- DAP: Sona DAP, Engro DAP, Sarsabz DAP
- SSP: Sona SSP, Engro SSP
- Potash/MOP: Sona MOP, imported MOP via dealers
- NPK/compound: Engro Zorawar, Sarsabz NP, Sona Boronated NP, etc.
- Micronutrients: Sarsabz Zinc, Engro Zorawar (where relevant)

Recommend 2-4 fertilizers tailored to the recommended crop AND gaps in the soil NPK. Include dose in kg/acre (common Pakistani unit) and timing (sowing, vegetative, flowering, etc.).

Respond with ONLY valid JSON (no markdown, no code fences) in this exact shape:
{
  "best_crop": "crop name",
  "reasoning": "2-3 sentences explaining why this crop fits these NPK levels",
  "soil_match": "brief note on how N, P, K levels align with this crop's needs",
  "fertilizer_summary": "1-2 sentences on overall fertilizer strategy for this crop and soil in Pakistan",
  "fertilizers": [
    {
      "brand_name": "e.g. Engro Urea",
      "type": "Nitrogen | Phosphorus | Potassium | NPK blend | Micronutrient",
      "purpose": "why this product for this crop/soil",
      "dose": "e.g. 1 bag (50 kg) per acre",
      "timing": "e.g. at sowing / 30 days after sowing",
      "note": "optional dealer tip or mixing caution"
    }
  ],
  "tips": ["tip 1", "tip 2", "tip 3"],
  "alternative_crops": ["crop 2", "crop 3"]
}`;
  }

  function parseModelResponse(content) {
    const trimmed = content.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return valid JSON.");
    return JSON.parse(jsonMatch[0]);
  }

  function readApiError(response, data) {
    const raw = data?.error?.message || data?.error || data?.message || `API error (${response.status})`;
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    return text;
  }

  function getModelCandidates() {
    const configured = (typeof CONFIG !== "undefined" && CONFIG.MODEL) || "openai/gpt-oss-120b:free";
    const list = Array.isArray(configured) ? configured : [configured];
    // Fallback route managed by OpenRouter when a specific provider/model fails.
    list.push("openrouter/auto");
    return [...new Set(list.filter(Boolean))];
  }

  async function parseJsonResponseSafe(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (_) {
      return { message: text };
    }
  }

  async function fetchRecommendation(n, p, k, apiKey) {
    const siteUrl = (typeof CONFIG !== "undefined" && CONFIG.SITE_URL) || window.location.origin;
    const siteName = (typeof CONFIG !== "undefined" && CONFIG.SITE_NAME) || "SoilCrop";
    const modelCandidates = getModelCandidates();
    let lastError = "";

    for (const model of modelCandidates) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": siteUrl,
          "X-Title": siteName,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: buildPrompt(n, p, k),
            },
          ],
          temperature: 0.4,
          max_tokens: 1200,
        }),
      });

      const data = await parseJsonResponseSafe(response);

      if (!response.ok) {
        const msg = readApiError(response, data);
        lastError = `Model ${model}: ${msg}`;
        const canRetry = /provider returned error|no endpoints found|model not found|rate limit|temporarily unavailable/i.test(msg);
        if (canRetry) continue;
        throw new Error(lastError);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `Model ${model}: Empty response from model.`;
        continue;
      }

      try {
        return parseModelResponse(content);
      } catch (err) {
        lastError = `Model ${model}: ${err.message || "Invalid JSON from model."}`;
      }
    }

    throw new Error(lastError || "Could not get a valid response from OpenRouter. Check API key, model access, and account balance.");
  }

  function getNpkValues() {
    return {
      n: parseFloat(nitrogenInput.value),
      p: parseFloat(phosphorusInput.value),
      k: parseFloat(potassiumInput.value),
    };
  }

  function fillNpkInputs(reading) {
    nitrogenInput.value = reading.n;
    phosphorusInput.value = reading.p;
    potassiumInput.value = reading.k;
  }

  function setSensorStatus(state, message) {
    sensorStatusEl.dataset.state = state;
    sensorStatusText.textContent = message;
  }

  async function runAnalysis(source) {
    if (analyzeInFlight) return;

    const { n, p, k } = getNpkValues();

    if ([n, p, k].some((v) => Number.isNaN(v) || v < 0)) {
      if (source === "sensor") {
        showError("Sensor sent invalid NPK values. Check wiring and upload arduino/npk_sensor.ino.");
      } else {
        showError("Please enter valid non-negative numbers for N, P, and K.");
      }
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      showError("Add your OpenRouter API key under API settings or in js/config.js.");
      return;
    }

    analyzeInFlight = true;
    setLoading(true);
    if (source !== "sensor") {
      showPlaceholder();
      errorEl.hidden = true;
    } else {
      setSensorStatus("reading", `Analyzing N=${n} P=${p} K=${k} mg/kg…`);
    }

    try {
      const result = await fetchRecommendation(n, p, k, apiKey);
      showResult(result);
      if (source === "sensor") {
        setSensorStatus("connected", "Connected — listening for next reading");
      }
    } catch (err) {
      showError(err.message || "Something went wrong. Check your API key and try again.");
      if (source === "sensor") setSensorStatus("connected", "Connected — ready for next reading");
    } finally {
      setLoading(false);
      analyzeInFlight = false;
    }
  }

  function onSensorReading(reading) {
    // Guard: only accept finite non-negative numbers
    if (!Number.isFinite(reading.n) || !Number.isFinite(reading.p) || !Number.isFinite(reading.k)) {
      console.warn('[App] Invalid sensor reading received:', reading);
      setSensorStatus("error", "Sensor sent invalid NPK values — check wiring and upload arduino/npk_sensor.ino. See console for raw serial output.");
      return;
    }

    if (reading.n < 0 || reading.p < 0 || reading.k < 0) {
      setSensorStatus("error", "Sensor error on one or more channels — check RS485 wiring");
      return;
    }

    const key = `${reading.n},${reading.p},${reading.k}`;

    if (isManualOverrideActive()) {
      sensorLastReadingEl.hidden = false;
      sensorLastReadingEl.textContent = `Sensor received (manual mode active): N ${reading.n}, P ${reading.p}, K ${reading.k} mg/kg`;
      setSensorStatus("connected", "Manual values active. Sensor updates are temporarily paused.");
      return;
    }

    fillNpkInputs(reading);

    const time = new Date().toLocaleTimeString();
    sensorLastReadingEl.hidden = false;
    sensorLastReadingEl.textContent = `Last reading: N ${reading.n}, P ${reading.p}, K ${reading.k} mg/kg at ${time}`;

    if (key === lastSensorKey) return;
    lastSensorKey = key;

    setSensorStatus("reading", `Received N=${reading.n} P=${reading.p} K=${reading.k} mg/kg`);

    if (autoAnalyzeCheckbox.checked) {
      runAnalysis("sensor");
    }
  }

  function initSensor() {
    if (!window.SoilSensor) return;

    if (!SoilSensor.isSupported()) {
      sensorConnectBtn.disabled = true;
      setSensorStatus("error", "Use Chrome or Edge on http://localhost to connect USB serial");
      return;
    }

    SoilSensor.setOnReading(onSensorReading);
    SoilSensor.setOnStatus(({ state, message }) => {
      if (state === "connected") {
        sensorConnectBtn.hidden = true;
        sensorDisconnectBtn.hidden = false;
      }
      if (state === "disconnected") {
        sensorConnectBtn.hidden = false;
        sensorDisconnectBtn.hidden = true;
        lastSensorKey = "";
      }
      setSensorStatus(state, message);
    });

    sensorConnectBtn.addEventListener("click", async () => {
      try {
        await SoilSensor.connect();
      } catch (err) {
        if (err.name !== "NotFoundError") {
          const message = String(err.message || "Could not connect to Arduino");
          if (/failed to open serial port|access is denied|port is busy|in use/i.test(message)) {
            setSensorStatus(
              "error",
              "Serial port is already open in another app. Close Arduino Serial Monitor or any app using COM5, then click Connect Arduino again."
            );
          } else {
            setSensorStatus("error", message);
          }
        }
      }
    });

    sensorDisconnectBtn.addEventListener("click", async () => {
      await SoilSensor.disconnect();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    enableManualOverride(45);
    setSensorStatus("reading", "Analyzing manually entered NPK values…");
    await runAnalysis("manual");
  });

  [nitrogenInput, phosphorusInput, potassiumInput].forEach((input) => {
    input.addEventListener("input", () => {
      enableManualOverride(45);
      if (window.SoilSensor && SoilSensor.isConnected()) {
        setSensorStatus("connected", "Manual edit detected. Sensor auto-fill paused for 45s.");
      }
    });
  });

  function initCopyrightYear() {
    const yearEl = document.getElementById("copyright-year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  initApiKey();
  initCopyrightYear();
  initSensor();
})();
