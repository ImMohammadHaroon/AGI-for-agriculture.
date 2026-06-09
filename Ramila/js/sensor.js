(function (global) {
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
      // Accept only finite, non-negative numeric readings
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

    // Log raw incoming lines for debugging
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

  global.SoilSensor = {
    connect,
    disconnect,
    isConnected,
    isSupported,
    setOnReading,
    setOnStatus,
  };
})(window);
