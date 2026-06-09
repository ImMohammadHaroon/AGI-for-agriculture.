# Project Documentation: LeafScan AI & SoilCrop NPK Sensor

## 1. Project Overview

This project is a smart agriculture web application designed to assist farmers and agronomists with data-driven crop management and plant disease diagnosis. It features two core tools:
1. **LeafScan AI**: Allows users to upload images of plant leaves to detect diseases and receive actionable treatment plans.
2. **SoilCrop NPK Advisor**: Evaluates soil nutrient levels (Nitrogen, Phosphorus, Potassium) through manual input or real-time Arduino sensor data via the Web Serial API. It then recommends the single best crop to plant along with a tailored fertilizer strategy, specifically targeting the Pakistani agricultural market.

**Core Problem Solved:** Bridging the gap between raw agricultural data (soil metrics, crop visuals) and actionable agronomic intelligence using AI models, making expert-level farming advice accessible through a simple web interface.

**Target Users:** Farmers (specifically in Pakistan), agronomists, agricultural students, and hobbyist gardeners.

---

## 2. Tech Stack

- **Frontend Framework:** React 19 via Vite. React allows for modular UI development and efficient state management.
- **Routing:** React Router v7 (`react-router-dom`) for creating a seamless Single Page Application (SPA) experience.
- **Hardware Integration:** Web Serial API (native browser API) allowing direct browser-to-Arduino USB serial communication without needing a local backend daemon.
- **AI/LLM Integration:** OpenAI API (for React) and OpenRouter (for the Vanilla Prototype). The system utilizes GPT-4 level models to analyze tabular NPK data and plant imagery.
- **Hardware (C++):** Arduino + RS485 Modbus RTU, utilizing the `SoftwareSerial` library to poll physical NPK soil sensors and transmit JSON over USB out.
- **Prototyping Environment:** The `Ramila` folder serves as a Vanilla JS/HTML/CSS prototype and hardware code repository, which was likely used to iron out the Web Serial logic before porting to React.

---

## 3. Architecture & System Design

**High-Level Architecture:**
The application is a pure client-side SPA that acts as an orchestrator between hardware inputs, user inputs, and third-party AI APIs. 

**Data Flow (NPK Sensor Workflow):**
1. **Hardware Layer:** Soil NPK Sensor reads data via Modbus RTU → Arduino processes it → Arduino transmits data over USB Serial as a JSON string (`NPK_JSON: {"n": ..., "p": ..., "k": ...}`).
2. **Browser Layer:** The frontend uses the Web Serial API to open the COM port, read the data stream, decode the text, and parse the JSON.
3. **Logic Layer:** React state receives the reading. If auto-analyze is enabled, it structures a prompt containing the N-P-K levels.
4. **AI Layer:** The prompt is sent to OpenAI's REST API. The LLM generates a JSON-structured agronomy report.
5. **UI Layer:** The application parses the API response and renders the recommended crop and fertilizers to the DOM.

**Patterns Used:**
- **Module Pattern:** Used deeply in the `SoilSensor` logic (both React and Vanilla instances) to encapsulate serial connection state and expose a clean API (`connect`, `disconnect`, `setOnReading`).
- **Client-Side AI Inference:** Uses zero-backend architecture. Prompts the LLM directly from the browser (Note: This is a prototyping pattern; see *Known Issues*).

---

## 4. Project Structure

```text
├── package.json               # Node.js dependencies, Vite/ESLint scripts
├── vite.config.js             # Vite bundler configuration
├── eslint.config.js           # ESLint configuration for code quality
├── README.md                  # Project instructions
├── index.html                 # Main entry point for the React Vite application
├── public/                    # Public static assets
├── src/                       # React Application Source Code
│   ├── App.jsx                # LeafScan AI feature (Image upload & disease detection)
│   ├── SoilCrop.jsx           # SoilCrop NPK feature (Web Serial, Forms, and AI suggestions)
│   ├── Layout.jsx             # Shared top-level layout (Navbar, Footer, routing logic)
│   ├── main.jsx               # React initialization and Router configuration
│   ├── Icons.jsx              # Reusable SVG Icons component library
│   ├── index.css              # Global styles
│   ├── soilcrop.css           # Styling specific to the NPK advising tool
│   └── assets/                # Local images and generic assets
└── Ramila/                    # Standalone Vanilla JS Prototype & Hardware Code
    ├── index.html             # Static layout for the SoilCrop Vanilla interface
    ├── arduino/
    │   └── npk_sensor/
    │       └── npk_sensor.ino # Arduino script to interface with Modbus NPK sensor
    ├── css/
    │   └── style.css          # Vanilla UI styling
    └── js/
        ├── app.js             # Core Vanilla DOM manipulation and AI fetching logic
        ├── config.js          # API key & OpenRouter model configurations
        └── sensor.js          # Web Serial API handler module
```

---

## 5. Features (Detailed)

### Feature 1: LeafScan AI (`src/App.jsx`)
- **What it does:** Allows users to upload or drag-and-drop a photo of a plant leaf. It determines what disease the plant is suffering from and returns a treatment plan.
- **How it works internally:** Converts the file via a `FileReader` into a format appropriate for the OpenAI Vision API. Injects it alongside a hardcoded `SYSTEM_PROMPT` instructing the AI to act as a plant pathologist and respond with purely structured JSON containing `disease`, `cause`, and `treatment`.
- **User Experience:** An interactive file upload interface showing loading states, parsing the resulting AI JSON, and clearly displaying step-by-step treatment instructions accompanied by status icons.

### Feature 2: NPK Web Serial Monitor (`src/SoilCrop.jsx` / `Ramila/js/sensor.js`)
- **What it does:** Reads live Nitrogen, Phosphorus, and Potassium data directly from an Arduino plugged into the user's computer.
- **How it works internally:** Leverages `navigator.serial.requestPort()`. Opens a 9600-baud stream, pipes the reader via a `TextDecoderStream`, and regex matched / JSON-parses lines resembling `NPK_JSON:{"n":...}`. Uses callbacks (`onReadingCallback`) to push the readings upward to React state.
- **User Experience:** The user clicks "Connect Arduino", selects their COM port in a browser prompt, and instantly sees live data on their screen without installing extra drivers or apps.

### Feature 3: Agronomist AI Engine (`src/SoilCrop.jsx`)
- **What it does:** Takes N, P, K values (either manually inputted or captured from the sensor) and outputs a detailed farming strategy. 
- **How it works internally:** Crafts a strict prompt asking for the best crop fit for the NPK values alongside specific Pakistani market fertilizers (e.g., *Engro Urea*, *Sarsabz DAP*). Fetches response from `openai` API, safely parses the JSON, and handles rate limits/errors robustly.
- **User Experience:** The user sees a summarized rationale, how their soil matches the crop, and beautiful "cards" displaying specific fertilizer products, dosages, and application timing.

---

## 6. API Reference

The app has no backend. However, it relies heavily on external LLM inference.

**OpenAI Chat Completions API (`POST https://api.openai.com/v1/chat/completions`)**
- **Authentication:** `Bearer <VITE_OPENAI_API_KEY>`
- **Request Body Payload (SoilCrop):** 
  ```json
  {
    "model": "gpt-4o-mini", // Model candidates array
    "messages": [ { "role": "user", "content": "..." } ],
    "temperature": 0.4,
    "max_tokens": 1200
  }
  ```
- **Expected Application-Level Response Constraint:** The prompt forces the LLM to return purely valid JSON schemas fitting:
  `{ "best_crop": string, "reasoning": string, "soil_match": string, "fertilizers": [ { brand_name, type, purpose, dose, timing } ], "tips": [string], "alternative_crops": [string] }`

---

## 7. Database / Data Models

The application operates entirely statelessly without a database. Transient state models (handled by React hooks) include:
1. **Sensor Reading Object:** `{ n: Number, p: Number, k: Number, unit: "mg/kg" }`
2. **AI Result Object:** Stored locally in component memory derived directly from the LLM JSON response.

---

## 8. Authentication & Authorization

No user authentication (login/registration) exists for the platform itself. 
- **API Authorization:** The frontend authorizes its requests to AI providers using a master API key.
- **Vanilla Setup (`Ramila/`):** API keys are fetched from `Ramila/js/config.js` or prompted via the UI and stored inside `localStorage` under `soilcrop_openrouter_key`.

---

## 9. State Management & Data Flow

State is managed locally using React hooks (`useState`, `useRef`, `useCallback`). 
- **Module state persistence:** The Web Serial implementation (`SoilSensor` inside `src/SoilCrop.jsx`) isolates its stream instances via an IIFE module to ensure hot-reloading does not cause serial port zombie locks.
- **Data Overlap Prevention:** `manualOverrideUntil` (a `useRef` timer) temporarily pauses automated API submittals from new serial output if a user is actively typing in the manual NPK inputs.
- **Debouncing / In-Flight prevention:** Uses a localized `analyzeInFlight` semantic lock to prevent stacking prompt requests to the expensive LLM endpoints.

---

## 10. Environment Variables & Configuration

**React Build Context:**
- `.env` file must be generated at the project root (`danyal-project/.env`).
- **`VITE_OPENAI_API_KEY`**: Exposed to the Vite bundle (`import.meta.env.VITE_OPENAI_API_KEY`). Required for LeafScan and SoilCrop AI analysis in the primary React app.

**Vanilla JS Context (`Ramila/js/config.js`):**
- **`CONFIG.OPENROUTER_API_KEY`**: The API key utilized if running via `Ramila/index.html`.
- **`CONFIG.MODEL`**: Defines the model (e.g., `openai/gpt-oss-120b:free`).

---

## 11. Installation & Local Setup

### Prerequisites
- Node.js (v18+)
- Web Serial-supported browser (Google Chrome, MS Edge, or Opera)
- (Hardware) Arduino Uno/Nano + Modbus TTL to RS485 converter + NPK Sensor

### Software Setup
1. **Clone project** and navigate to the project directory.
2. **Install modules:** `npm install`
3. **Environment setup:** Create a `.env` file in the root. Include:
   ```env
   VITE_OPENAI_API_KEY=sk-your-openai-api-key-here
   ```
4. **Run Vite development server:** `npm run dev`
5. Visit `http://localhost:5173`. (Note: Web Serial API *requires* HTTPS or `localhost` to function).

### Hardware Setup
1. Connect NPK Sensor RO to Arduino Pin 2, DI to Pin 3, and switch pin to Pin 4.
2. Open `Ramila/arduino/npk_sensor/npk_sensor.ino` in Arduino IDE.
3. Flash the code to the board. 
4. The board will immediately begin broadcasting JSON `N-P-K` via USB to the web platform.

---

## 12. Deployment

Because this is a static SPA, it can be deployed on any standard static hosting providing CDN features. 
- **Platform Recommendations:** Vercel, Netlify, or Cloudflare Pages.
- **Build command:** `npm run build`
- **Output directory:** `dist`

**Critical Step:** You must inject `VITE_OPENAI_API_KEY` into your host's environment variable secrets panel before building.

---

## 13. Known Issues / Limitations

1. **Client-Side Secret Exposure:** The largest architectural deficit is exposing `VITE_OPENAI_API_KEY` directly to the client browser. Any user can open developer tools and steal the OpenAI private key.
2. **Hardcoded Context:** The SoilCrop module prompt engineering inherently forces responses optimized for *"farmers in Pakistan"* and *"fertilizers sold in Pakistan"*, limiting the product's use outside that geographic layout.
3. **Web Serial Compatibility:** Will absolutely not function on mobile browsers (iOS Safari, Android Chrome) or desktop Safari, effectively locking the hardware functionality to Desktop Chromium environments.
4. **LLM JSON Parsing Reliance:** Relies entirely on the LLM adhering to a strict JSON structure. Generative deviation results in `JSON.parse` failures and application errors for the end-user.

---

## 14. Future Improvements

1. **Backend Proxy (Security):** Introduce a lightweight backend (e.g., Express.js, Next.js API Routes, Cloudflare Workers) to proxy the OpenAI requests. This encrypts the API key and allows for proper user rate-limiting.
2. **Location/Region Selection:** Replace the hardcoded Pakistani market prompt snippet with dynamic user location selectors so the LLM outputs custom fertilizers globally.
3. **Historical Data / Account System:** Tie the NPK readings and leaf diagnostics to a database (like Firebase or Supabase), allowing farmers to chart their soil degradation over time.
4. **Structured Outputs:** Shift the OpenAI API request payload from arbitrary text prompt structures to the official [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) (`response_format: { type: "json_schema" }`) to guarantee 0% failure rates purely due to JSON parser syntax.