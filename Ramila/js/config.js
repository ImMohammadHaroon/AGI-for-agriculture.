// Paste your OpenRouter API key here, or enter it in the app under API settings.
// Get a key at: https://openrouter.ai/keys
const CONFIG = {
  OPENROUTER_API_KEY: "",
  MODEL: "openai/gpt-oss-120b:free",
  SITE_URL: typeof window !== "undefined" ? window.location.origin : "http://localhost",
  SITE_NAME: "SoilCrop NPK Advisor",
};
