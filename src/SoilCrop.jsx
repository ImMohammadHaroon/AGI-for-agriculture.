import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// SoilSensor Module
const SoilSensor = (() => {
  const BAUD = 9600;
  let port = null;
  let reader = null;
  let readLoopActive = false;
  let onReadingCallback = null;
  let onStatusCallback = null;

  const pending = { n: null, p: null, k: null };

  function isSupported() {
    return "serial" in navigator;
  }

  function setOnReading(fn) {
    onReadingCallback = fn;
  }

  function setOnStatus(fn) {
    onStatusCallback = fn;
  }

  function emitStatus(state, message) {
    if (onStatusCallback) onStatusCallback({ state, message });
  }

  function parseJsonLine(line) {
    const jsonStart = line.indexOf("{");
    if (jsonStart === -1) return null;
    try {
      const data = JSON.parse(line.slice(jsonStart));
      const n = Number(data.n);
      const p = Number(data.p);
      const k = Number(data.k);
      if (Number.isFinite(n) && Number.isFinite(p) && Number.isFinite(k) && n >= 0 && p >= 0 && k >= 0) {
        return { n, p, k, unit: data.unit || "mg/kg" };
      }
    } catch (_) {
      console.warn("[SoilSensor] parseJsonLine failed to parse JSON:", line);
    }
    return null;
  }

  function parseTextLine(line) {
    const nMatch = line.match(/Nitrogen\s*\(N\):\s*(\d+)/i);
    const pMatch = line.match(/Phosphorus\s*\(P\):\s*(\d+)/i);
    const kMatch = line.match(/Potassium\s*\(K\):\s*(\d+)/i);
    if (nMatch) pending.n = parseInt(nMatch[1], 10);
    if (pMatch) pending.p = parseInt(pMatch[1], 10);
    if (kMatch) pending.k = parseInt(kMatch[1], 10);
  }

  function flushPending() {
    const hasValidReading =
      Number.isFinite(pending.n) && Number.isFinite(pending.p) && Number.isFinite(pending.k) &&
      pending.n >= 0 && pending.p >= 0 && pending.k >= 0;

    if (!hasValidReading) {
      console.warn("[SoilSensor] Ignored incomplete reading:", pending);
      pending.n = pending.p = pending.k = null;
      return;
    }

    const reading = { n: pending.n, p: pending.p, k: pending.k, unit: "mg/kg" };
    pending.n = pending.p = pending.k = null;
    if (onReadingCallback) onReadingCallback(reading);
  }

  function handleLine(raw) {
    const line = raw.trim();
    if (!line) return;

    console.debug("[SoilSensor] LINE:", line);

    if (line.startsWith("NPK_JSON:")) {
      const reading = parseJsonLine(line.replace("NPK_JSON:", ""));
      if (reading && onReadingCallback) {
        onReadingCallback(reading);
      } else {
        console.warn("[SoilSensor] Ignored invalid NPK_JSON line:", line);
      }
      return;
    }

    if (line.startsWith("{")) {
      const reading = parseJsonLine(line);
      if (reading && onReadingCallback) {
        onReadingCallback(reading);
      } else {
        console.warn("[SoilSensor] Ignored invalid JSON line:", line);
      }
      return;
    }

    parseTextLine(line);

    if (line.startsWith("================================")) {
      flushPending();
    }
  }

  async function readLoop() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    reader = decoder.readable.getReader();
    let buffer = "";

    while (readLoopActive) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach(handleLine);
      } catch (err) {
        if (readLoopActive) emitStatus("error", err.message || "Serial read failed");
        break;
      }
    }
  }

  async function connect() {
    if (!isSupported()) {
      throw new Error("Web Serial is not supported. Use Chrome or Edge on localhost.");
    }
    if (port) return;

    port = await navigator.serial.requestPort();
    await port.open({ baudRate: BAUD });
    readLoopActive = true;
    emitStatus("connected", "Arduino connected — waiting for sensor readings…");
    readLoop();
  }

  async function disconnect() {
    readLoopActive = false;
    if (reader) {
      try {
        await reader.cancel();
      } catch (_) {
        /* ignore */
      }
      reader = null;
    }
    if (port) {
      try {
        await port.close();
      } catch (_) {
        /* ignore */
      }
      port = null;
    }
    pending.n = pending.p = pending.k = null;
    emitStatus("disconnected", "Sensor disconnected");
  }

  function isConnected() {
    return !!port;
  }

  return {
    connect,
    disconnect,
    isConnected,
    isSupported,
    setOnReading,
    setOnStatus,
  };
})();

// Helper functions outside component to avoid recreation
function fertilizerTypeClass(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("nitrogen") || t === "n") return "ftype-n";
  if (t.includes("phosph") || t === "p") return "ftype-p";
  if (t.includes("potass") || t === "k") return "ftype-k";
  if (t.includes("npk") || t.includes("compound") || t.includes("blend")) return "ftype-npk";
  return "ftype-other";
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
  return ["gpt-4o-mini"];
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
  const modelCandidates = getModelCandidates();
  let lastError = "";

  for (const model of modelCandidates) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
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
      const canRetry = /rate limit|temporarily unavailable/i.test(msg);
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

  throw new Error(lastError || "Could not get a valid response from OpenAI. Check API key and account balance.");
}

export default function SoilCrop() {
  // Form state
  const [nitrogen, setNitrogen] = useState("");
  const [phosphorus, setPhosphorus] = useState("");
  const [potassium, setPotassium] = useState("");
  
  // App state
  const [loading, setLoading] = useState(false);
  const [outputState, setOutputState] = useState("placeholder"); // placeholder, error, result
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState(null);
  
  // Sensor state
  const [sensorStatus, setSensorStatus] = useState("idle"); // idle, connected, reading, error, disconnected
  const [sensorStatusText, setSensorStatusText] = useState("Sensor not connected");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [sensorLastReading, setSensorLastReading] = useState("");
  
  const [analyzeInFlight, setAnalyzeInFlight] = useState(false);
  
  // Refs
  const manualOverrideUntil = useRef(0);
  const lastSensorKey = useRef("");

  // Check manual override
  const isManualOverrideActive = () => Date.now() < manualOverrideUntil.current;
  const enableManualOverride = (seconds = 20) => {
    manualOverrideUntil.current = Date.now() + seconds * 1000;
  };

  const getApiKey = () => {
    return API_KEY;
  };

  const runAnalysis = async (source, nVal, pVal, kVal) => {
    if (analyzeInFlight) return;

    const n = parseFloat(nVal ?? nitrogen);
    const p = parseFloat(pVal ?? phosphorus);
    const k = parseFloat(kVal ?? potassium);

    if ([n, p, k].some((v) => Number.isNaN(v) || v < 0)) {
      if (source === "sensor") {
        setOutputState("error");
        setErrorMessage("Sensor sent invalid NPK values. Check wiring and upload arduino/npk_sensor.ino.");
      } else {
        setOutputState("error");
        setErrorMessage("Please enter valid non-negative numbers for N, P, and K.");
      }
      return;
    }

    const currentApiKey = getApiKey();
    if (!currentApiKey) {
      setOutputState("error");
      setErrorMessage("OpenAI API key is missing. Please add VITE_OPENAI_API_KEY to your .env file.");
      return;
    }

    setAnalyzeInFlight(true);
    setLoading(true);
    
    if (source !== "sensor") {
      setOutputState("placeholder");
    } else {
      setSensorStatus("reading");
      setSensorStatusText(`Analyzing N=${n} P=${p} K=${k} mg/kg…`);
    }

    try {
      const rec = await fetchRecommendation(n, p, k, currentApiKey);
      setResult(rec);
      setOutputState("result");
      
      if (source === "sensor") {
        setSensorStatus("connected");
        setSensorStatusText("Connected — listening for next reading");
      }
    } catch (err) {
      setOutputState("error");
      setErrorMessage(err.message || "Something went wrong. Check your API key and try again.");
      if (source === "sensor") {
        setSensorStatus("connected");
        setSensorStatusText("Connected — ready for next reading");
      }
    } finally {
      setLoading(false);
      setAnalyzeInFlight(false);
    }
  };

  // Setup Sensor Callbacks
  useEffect(() => {
    if (!SoilSensor.isSupported()) {
      setSensorStatus("error");
      setSensorStatusText("Use Chrome or Edge on http://localhost to connect USB serial");
      return;
    }

    SoilSensor.setOnStatus(({ state, message }) => {
      if (state === "disconnected") {
        lastSensorKey.current = "";
      }
      setSensorStatus(state);
      setSensorStatusText(message);
    });

    return () => {
      SoilSensor.setOnReading(null);
      SoilSensor.setOnStatus(null);
    };
  }, []);

  // Use a ref to access the latest state in the callback without recreating it
  const autoAnalyzeRef = useRef(autoAnalyze);
  const runAnalysisRef = useRef(runAnalysis);
  
  useEffect(() => {
    autoAnalyzeRef.current = autoAnalyze;
    runAnalysisRef.current = runAnalysis;
  }, [autoAnalyze, runAnalysis]);

  useEffect(() => {
    SoilSensor.setOnReading((reading) => {
      if (!Number.isFinite(reading.n) || !Number.isFinite(reading.p) || !Number.isFinite(reading.k)) {
        console.warn('[App] Invalid sensor reading received:', reading);
        setSensorStatus("error");
        setSensorStatusText("Sensor sent invalid NPK values — check wiring and upload arduino/npk_sensor.ino. See console for raw serial output.");
        return;
      }

      if (reading.n < 0 || reading.p < 0 || reading.k < 0) {
        setSensorStatus("error");
        setSensorStatusText("Sensor error on one or more channels — check RS485 wiring");
        return;
      }

      const key = `${reading.n},${reading.p},${reading.k}`;

      if (Date.now() < manualOverrideUntil.current) {
        setSensorLastReading(`Sensor received (manual mode active): N ${reading.n}, P ${reading.p}, K ${reading.k} mg/kg`);
        setSensorStatus("connected");
        setSensorStatusText("Manual values active. Sensor updates are temporarily paused.");
        return;
      }

      setNitrogen(String(reading.n));
      setPhosphorus(String(reading.p));
      setPotassium(String(reading.k));

      const time = new Date().toLocaleTimeString();
      setSensorLastReading(`Last reading: N ${reading.n}, P ${reading.p}, K ${reading.k} mg/kg at ${time}`);

      if (key === lastSensorKey.current) return;
      lastSensorKey.current = key;

      setSensorStatus("reading");
      setSensorStatusText(`Received N=${reading.n} P=${reading.p} K=${reading.k} mg/kg`);

      if (autoAnalyzeRef.current) {
        runAnalysisRef.current("sensor", reading.n, reading.p, reading.k);
      }
    });
  }, []);

  const handleConnect = async () => {
    try {
      await SoilSensor.connect();
    } catch (err) {
      if (err.name !== "NotFoundError") {
        const message = String(err.message || "Could not connect to Arduino");
        if (/failed to open serial port|access is denied|port is busy|in use/i.test(message)) {
          setSensorStatus("error");
          setSensorStatusText(
            "Serial port is already open in another app. Close Arduino Serial Monitor or any app using COM5, then click Connect Arduino again."
          );
        } else {
          setSensorStatus("error");
          setSensorStatusText(message);
        }
      }
    }
  };

  const handleDisconnect = async () => {
    await SoilSensor.disconnect();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    enableManualOverride(45);
    setSensorStatus("reading");
    setSensorStatusText("Analyzing manually entered NPK values…");
    await runAnalysis("manual");
  };

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    enableManualOverride(45);
    if (SoilSensor.isConnected()) {
      setSensorStatus("connected");
      setSensorStatusText("Manual edit detected. Sensor auto-fill paused for 45s.");
    }
  };

  return (
    <div className="soilcrop-container">
      {/* We add a div with a custom class to scope the soilcrop styles without breaking layout */}
      <div className="bg-pattern" aria-hidden="true"></div>

      <main className="layout">
        <section className="card card-input" aria-labelledby="input-heading">
          <h2 id="input-heading">Soil nutrients (NPK)</h2>
          <p className="card-desc">Connect your <strong>Arduino NPK sensor</strong> for live readings (mg/kg), or enter values manually.</p>

          <div className="sensor-panel" id="sensor-panel">
            <div className="sensor-status" id="sensor-status" data-state={sensorStatus}>
              <span className="sensor-dot" aria-hidden="true"></span>
              <span id="sensor-status-text">{sensorStatusText}</span>
            </div>
            <div className="sensor-actions">
              {sensorStatus === 'connected' || sensorStatus === 'reading' ? (
                <button type="button" className="btn-secondary btn-ghost" id="sensor-disconnect-btn" onClick={handleDisconnect}>Disconnect</button>
              ) : (
                <button type="button" className="btn-secondary" id="sensor-connect-btn" onClick={handleConnect} disabled={!SoilSensor.isSupported()}>Connect Arduino</button>
              )}
            </div>
            <label className="sensor-auto">
              <input type="checkbox" id="auto-analyze" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
              Auto-analyze when new sensor reading arrives
            </label>
            {sensorLastReading && (
              <p className="sensor-hint" id="sensor-last-reading">{sensorLastReading}</p>
            )}
          </div>

          <form id="npk-form" noValidate onSubmit={handleFormSubmit}>
            <div className="npk-grid">
              <label className="field field-n">
                <span className="field-label">
                  <span className="nutrient-badge nutrient-n">N</span>
                  Nitrogen
                </span>
                <input type="number" id="nitrogen" name="nitrogen" min="0" step="any" placeholder="e.g. 120" required value={nitrogen} onChange={handleInputChange(setNitrogen)} />
                <span className="field-hint">From sensor: mg/kg</span>
              </label>

              <label className="field field-p">
                <span className="field-label">
                  <span className="nutrient-badge nutrient-p">P</span>
                  Phosphorus
                </span>
                <input type="number" id="phosphorus" name="phosphorus" min="0" step="any" placeholder="e.g. 45" required value={phosphorus} onChange={handleInputChange(setPhosphorus)} />
                <span className="field-hint">Root &amp; flowering support</span>
              </label>

              <label className="field field-k">
                <span className="field-label">
                  <span className="nutrient-badge nutrient-k">K</span>
                  Potassium
                </span>
                <input type="number" id="potassium" name="potassium" min="0" step="any" placeholder="e.g. 180" required value={potassium} onChange={handleInputChange(setPotassium)} />
                <span className="field-hint">Disease resistance &amp; quality</span>
              </label>
            </div>



            <button type="submit" className="btn-primary" id="submit-btn" disabled={loading}>
              {!loading && <span className="btn-text">Find best crop</span>}
              {loading && <span className="btn-loader" aria-hidden="true"></span>}
            </button>
          </form>
        </section>

        <section className="card card-output" aria-labelledby="output-heading" aria-live="polite">
          <h2 id="output-heading">Recommendation</h2>

          {outputState === "placeholder" && (
            <div id="output-placeholder" className="output-placeholder">
              <div className="placeholder-icon" aria-hidden="true">🌾</div>
              <p>Connect your Arduino sensor or enter NPK manually to get crop and <strong>Pakistan-market fertilizer</strong> advice.</p>
            </div>
          )}

          {outputState === "error" && (
            <div id="output-error" className="output-error" role="alert">
              {errorMessage}
            </div>
          )}

          {outputState === "result" && result && (
            <article id="output-result" className="output-result">
              <div className="result-header">
                <span className="result-badge">Top pick</span>
                <h3 id="crop-name">{result.best_crop || "Unknown crop"}</h3>
              </div>
              <div id="crop-details" className="result-body">
                <p><strong>Why this crop:</strong> {result.reasoning || "—"}</p>
                <h4>Soil match</h4>
                <p>{result.soil_match || "—"}</p>
                
                {result.fertilizers && result.fertilizers.length > 0 && (
                  <>
                    <h4>Fertilizers (Pakistan market)</h4>
                    <p className="fertilizer-intro">{result.fertilizer_summary || "Products commonly sold at Pakistani agri-dealers (Engro, FFC, Fatima, Fauji, etc.)."}</p>
                    <div className="fertilizer-grid">
                      {result.fertilizers.map((f, i) => (
                        <article key={i} className="fertilizer-card">
                          <div className="fertilizer-card-head">
                            <span className={`fertilizer-type ${fertilizerTypeClass(f.type)}`}>{f.type || "NPK"}</span>
                            <h5>{f.brand_name || f.name || "—"}</h5>
                          </div>
                          <p className="fertilizer-purpose">{f.purpose || "—"}</p>
                          <dl className="fertilizer-meta">
                            <div><dt>Dose</dt><dd>{f.dose || "—"}</dd></div>
                            <div><dt>When</dt><dd>{f.timing || "—"}</dd></div>
                          </dl>
                          {f.note && <p className="fertilizer-note">{f.note}</p>}
                        </article>
                      ))}
                    </div>
                  </>
                )}

                <h4>Growing tips</h4>
                <ul>
                  {(result.tips || []).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                  {(!result.tips || result.tips.length === 0) && <li>—</li>}
                </ul>

                {result.alternative_crops && result.alternative_crops.length > 0 && (
                  <>
                    <h4>Also suitable</h4>
                    <div className="alt-crops">
                      {result.alternative_crops.map((c, i) => (
                        <span key={i} className="alt-crop-tag">{c}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}
