# Project Documentation: LeafScan AI & SoilCrop

## 1. Project Overview
This project is an AI-powered agricultural web application designed to assist farmers and agronomists in making data-driven decisions. It solves two core problems in agriculture:
1. **Plant Disease Diagnosis:** By uploading a picture of a leaf, users can instantly identify plant diseases, their causes, and actionable treatment plans.
2. **Soil Analysis & Crop Recommendation:** By connecting to an Arduino-based NPK (Nitrogen, Phosphorus, Potassium) sensor directly through the browser, users get real-time soil nutrient readings. These readings are then used to generate tailored crop recommendations and specific fertilizer strategies (focusing on the Pakistani market).

**Target Users:** Farmers, agronomists, and agricultural enthusiasts, specifically optimized with fertilizer data for the Pakistani agricultural market.

## 2. Tech Stack
* **Frontend Framework:** React (v19) - Chosen for building a highly interactive, component-based user interface.
* **Build Tool:** Vite - Chosen for extremely fast hot-module replacement (HMR) and optimized production builds.
* **Routing:** React Router v7 - Handles client-side routing between the Leaf Disease and NPK Sensor tools.
* **Hardware Integration:** Web Serial API - Allows the browser to communicate directly with the Arduino NPK sensor via USB/RS485 without requiring a backend server.
* **Artificial Intelligence:** OpenAI API (`gpt-4o-mini`) - Used for both image analysis (Vision) to detect leaf diseases and text generation to provide agronomy advice based on NPK values.
* **Styling:** Vanilla CSS (`index.css`, `soilcrop.css`) - For custom, lightweight, and responsive design without the overhead of heavy UI libraries.

## 3. Architecture & System Design
* **High-Level Architecture:** The application is a purely client-side Single Page Application (SPA). It relies entirely on external APIs (OpenAI) and browser APIs (Web Serial) for its core functionality, meaning it operates entirely without a custom backend server.
* **Data Flow (LeafScan AI):** User uploads image -> Image converted to Data URL -> Sent to OpenAI GPT-4o-mini with a specialized system prompt -> JSON response parsed -> Rendered in the UI.
* **Data Flow (SoilCrop):** Arduino sends serial data -> Browser Web Serial API reads stream -> Data is parsed for N, P, K values -> User triggers analysis (or auto-analyze) -> NPK values sent to OpenAI with agronomy prompt -> JSON response parsed -> Rendered in the UI.
* **Patterns Used:** 
  - **Modular Components:** The app is split into distinct feature components (`App.jsx` for LeafScan, `SoilCrop.jsx` for the NPK tool, and `Layout.jsx` for the shell).
  - **Observer Pattern (Hardware):** The `SoilSensor` module uses callbacks (`onReadingCallback`, `onStatusCallback`) to push hardware data to the React component.

## 4. Project Structure
```text
danyal-project/
├── .env                  # Environment variables (OpenAI API Key)
├── package.json          # Project metadata, scripts, and dependencies
├── vite.config.js        # Vite configuration
├── eslint.config.js      # ESLint rules for code quality
├── index.html            # Main HTML entry point for the React/Vite app
├── public/               # Static assets served at the root path
├── Ramila/               # Legacy/Standalone vanilla HTML/JS version of the SoilCrop app
│   ├── index.html        # Vanilla HTML entry
│   ├── css/              # Vanilla CSS files
│   ├── js/               # Vanilla JS logic (sensor.js, app.js, config.js)
│   └── arduino/          # Arduino sketches (e.g., npk_sensor.ino)
└── src/                  # React Source Code
    ├── main.jsx          # React initialization and Router setup
    ├── App.jsx           # "LeafScan" component: Image upload and disease detection
    ├── SoilCrop.jsx      # "SoilCrop" component: NPK sensor reading and crop advisor
    ├── Layout.jsx        # App layout shell containing Navbar and Footer
    ├── Icons.jsx         # SVG Icons used across the application
    ├── index.css         # Global styling and LeafScan styling
    ├── soilcrop.css      # Specific styling for the SoilCrop component
    └── assets/           # Images and other bundled assets
```

## 5. Features (Detailed)

### Feature 1: LeafScan AI (Plant Disease Diagnosis)
* **What it does:** Allows users to upload a photo of a plant leaf and get an AI-generated diagnosis.
* **How it works:** Users drag & drop or select an image (`.jpg`, `.png`, `.webp`). The file is read locally using `FileReader`, previewed on screen, and then sent to OpenAI's vision model. The prompt restricts the AI to return a specific JSON structure containing the disease name, cause, and a list of treatment steps.
* **Handling Files:** `src/App.jsx`.
* **User Experience:** The user gets instant visual feedback, loading states, and a cleanly formatted card showing Diagnosis (Healthy/Diseased/Invalid), Cause, and a numbered Treatment plan.

### Feature 2: SoilCrop (NPK Sensor & Crop Advisor)
* **What it does:** Reads live soil data from a hardware sensor and recommends the best crop and fertilizers.
* **How it works:** It uses the `navigator.serial` API to connect to an Arduino device. The `SoilSensor` IIFE module reads the serial stream, parses JSON or text lines to extract Nitrogen, Phosphorus, and Potassium values. Once obtained, these values are sent to OpenAI with a highly specialized prompt acting as a Pakistani agronomist. It returns the best crop, soil match analysis, and specific Pakistani fertilizer brands (e.g., Engro Urea, Sona DAP) with dosages.
* **Handling Files:** `src/SoilCrop.jsx`.
* **User Experience:** The user sees a live connection status (e.g., "Connected - listening for next reading"). When data arrives, it auto-fills the NPK form and can automatically trigger the AI analysis. The result is presented in a dashboard format with distinct cards for different fertilizer types.

## 6. API Reference
This project does not expose a custom backend API. It consumes the following external API:

* **OpenAI Chat Completions API**
  * **Endpoint:** `POST https://api.openai.com/v1/chat/completions`
  * **Authentication:** Bearer token (`VITE_OPENAI_API_KEY`)
  * **Usage:** Used for both Vision (LeafScan) and Text generation (SoilCrop). The app expects strict JSON responses from the AI to map to the UI components.

## 7. Database / Data Models
*Not applicable.* The application is stateless and does not use a database. All state is maintained in-memory within React components during the user session.

## 8. Authentication & Authorization
*Not applicable for end-users.* There is no user login system. The only authentication is the server-to-server (or in this case, client-to-server) authentication with the OpenAI API using the developer's API key.

## 9. State Management & Data Flow
* **State Management:** React local state (`useState`) is used exclusively. There is no Redux or Context API, as the state is localized to the specific tool being used.
* **Key Flows:**
  * **Layout:** `Layout.jsx` uses React Router's `<Outlet />` to swap between the LeafScan and SoilCrop views.
  * **Hardware State:** `SoilCrop.jsx` maintains `sensorStatus` (idle, connected, reading, error) which dictates UI feedback (spinners, buttons, messages).
  * **Analysis State:** Both main components track `loading`, `error`, and `result` states to conditionally render UI sections (Upload zone vs. Results card).

## 10. Environment Variables & Configuration
The project requires an environment file (`.env`) in the root directory.

* `VITE_OPENAI_API_KEY`
  * **Purpose:** The API key used to authenticate requests to OpenAI.
  * **Usage:** Imported in `App.jsx` and `SoilCrop.jsx` via `import.meta.env.VITE_OPENAI_API_KEY`. Without this, the AI analysis features will immediately return an error.

## 11. Installation & Local Setup
### Prerequisites
* Node.js (v18 or higher recommended)
* An active OpenAI API Key
* (Optional) An Arduino with an NPK RS485 sensor for the SoilCrop hardware feature. Chrome or Edge browser is required to use the Web Serial API.

### Steps
1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd danyal-project
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your OpenAI API key:
   ```env
   VITE_OPENAI_API_KEY=sk-your-actual-api-key-here
   ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```
5. **Open the app:** Navigate to `http://localhost:5173` in your browser.

## 12. Deployment
Because this is a purely client-side Vite application, it can be hosted on any static hosting provider.

* **Recommendations:** Vercel, Netlify, or GitHub Pages.
* **Build Command:** `npm run build`
* **Output Directory:** `dist/`
* **Important Note:** Exposing the OpenAI API key in the frontend (via `VITE_OPENAI_API_KEY`) is a **security risk** for a public, production deployment. Anyone can extract the key from the client bundle. For a true production deployment, you must build a lightweight proxy backend (e.g., Node.js/Express, Vercel Serverless Functions) to securely handle the OpenAI API calls.

## 13. Known Issues / Limitations
1. **Security:** The OpenAI API key is exposed to the client. This is fine for local use or private deployment but unsafe for public release.
2. **Web Serial Compatibility:** The hardware NPK sensor connection relies on the Web Serial API, which is only supported in Chromium-based browsers (Chrome, Edge, Opera) on desktops. It will not work on Safari, Firefox, or most mobile browsers.
3. **AI Hallucinations:** The crop and fertilizer recommendations rely entirely on an LLM. While prompted specifically, it may occasionally provide suboptimal agronomy advice.
4. **Duplicate Codebases:** There is a vanilla HTML/JS version of the app in the `Ramila/` folder which seems redundant given the React implementation in `src/`.

## 14. Future Improvements
* **Backend Proxy:** Implement a simple backend (e.g., using serverless functions) to hide the OpenAI API key and handle rate-limiting.
* **Save History:** Integrate `localStorage` or a database (like Firebase or Supabase) so users can save previous leaf scans and soil readings.
* **PDF Export:** Allow users to download their crop/fertilizer recommendations or disease treatment plans as a PDF.
* **Localization (Urdu):** Since the app is tailored for Pakistani farmers, adding multi-language support (specifically Urdu) would massively improve accessibility.
* **PWA (Progressive Web App):** Convert the app to a PWA so it can be installed on mobile devices for offline use (though AI features would still require an internet connection).
