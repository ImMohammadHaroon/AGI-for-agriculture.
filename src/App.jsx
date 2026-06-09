import { useState, useRef, useCallback } from 'react';
import {
  LeafIcon,
  UploadCloudIcon,
  SearchIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  TrashIcon,
  SparklesIcon,
  ShieldCheckIcon,
  BugIcon,
  ImageIcon,
} from './Icons';

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are an expert plant pathologist. 
Analyze the provided leaf image and respond ONLY in valid JSON with no extra text:

{
  "disease": "exact disease name or Healthy",
  "cause": "brief cause of the disease in 2-3 sentences",
  "treatment": [
    "treatment step 1",
    "treatment step 2", 
    "treatment step 3"
  ]
}

If the image is not a leaf or plant, return:
{
  "disease": "Invalid Image",
  "cause": "The uploaded image does not appear to be a plant leaf.",
  "treatment": ["Please upload a clear photo of a plant leaf."]
}`;

function getResultType(disease) {
  if (!disease) return 'unknown';
  const lower = disease.toLowerCase();
  if (lower === 'healthy') return 'healthy';
  if (lower === 'invalid image') return 'invalid';
  return 'diseased';
}

function App() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Handle file selection
  const handleFile = useCallback((file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('Image is too large. Please upload an image under 20MB.');
      return;
    }

    setError(null);
    setResult(null);
    setImage(file);

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  // Drag & Drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e) => {
    handleFile(e.target.files[0]);
  }, [handleFile]);



  // Remove image
  const removeImage = useCallback(() => {
    setImage(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Analyze image
  const analyzeImage = useCallback(async () => {
    if (!API_KEY) {
      setError('OpenAI API key is missing. Please add VITE_OPENAI_API_KEY to your .env file.');
      return;
    }
    if (!imagePreview) {
      setError('Please upload an image first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Please analyze this leaf image for any diseases.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imagePreview,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 800,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key.');
        }
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(errData.error?.message || `API request failed (${response.status})`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response received from the AI model.');
      }

      // Parse JSON from response (handle markdown code blocks)
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanContent);

      if (!parsed.disease || !parsed.cause || !Array.isArray(parsed.treatment)) {
        throw new Error('Unexpected response format from AI.');
      }

      setResult(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Failed to parse AI response. Please try again.');
      } else {
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }, [imagePreview]);

  const resultType = result ? getResultType(result.disease) : null;

  return (
    <>
      {/* Hero */}
      <section className="hero" id="hero">
        <h1>
          Detect Plant Diseases{' '}
          <span className="gradient-text">Instantly</span>
        </h1>
        <p className="subtitle">
          Upload a photo of any plant leaf and let our AI analyze it for
          diseases, identify causes, and recommend treatments.
        </p>
        <div className="hero-features">
          <div className="hero-pill">
            <SparklesIcon />
            AI-Powered Analysis
          </div>
          <div className="hero-pill">
            <ShieldCheckIcon />
            Instant Results
          </div>
          <div className="hero-pill">
            <LeafIcon />
            Treatment Plans
          </div>
        </div>
      </section>


      {/* Error Banner */}
      {error && (
        <div className="error-banner" id="error-banner" role="alert">
          <AlertCircleIcon className="error-icon" />
          {error}
        </div>
      )}

      {/* Upload Zone (shown when no image) */}
      {!imagePreview && (
        <section className="upload-section" id="upload-section">
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            id="upload-zone"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <div className="upload-icon-wrapper">
              <UploadCloudIcon />
            </div>
            <p className="upload-text">
              Drop your leaf image here or <span>click to browse</span>
            </p>
            <p className="upload-hint">Supports JPEG, PNG, WebP • Max 20MB</p>
            <input
              ref={fileInputRef}
              type="file"
              className="upload-input"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileInput}
              id="file-input"
            />
          </div>
        </section>
      )}

      {/* Preview + Results */}
      {imagePreview && (
        <section className="results-section" id="results-section">
          <div className="preview-container">
            {/* Image Preview Card */}
            <div className="image-preview-card" id="image-preview-card">
              <div className="image-preview-wrapper">
                <img src={imagePreview} alt="Uploaded leaf" />
              </div>
              <button
                className="analyze-btn"
                onClick={analyzeImage}
                disabled={loading || !API_KEY}
                id="analyze-btn"
              >
                {loading ? (
                  <>
                    <SparklesIcon className="analyze-btn-icon" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <SearchIcon className="analyze-btn-icon" />
                    Analyze Leaf
                  </>
                )}
              </button>
              <button className="remove-btn" onClick={removeImage} id="remove-btn">
                <TrashIcon />
                Remove Image
              </button>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="loading-container" id="loading-container">
                <div className="loading-spinner">
                  <div className="loading-spinner-ring"></div>
                  <div className="loading-spinner-ring"></div>
                  <div className="loading-spinner-dot"></div>
                </div>
                <div className="loading-text">Analyzing leaf...</div>
                <LeafIcon className="loading-leaf-icon" />
              </div>
            )}

            {/* Result Card */}
            {result && !loading && (
              <div
                className={`result-card ${resultType}`}
                id="result-card"
              >
                {/* Disease Name */}
                <div className="disease-section">
                  <span className="section-label">Diagnosis</span>
                  <div
                    className={`disease-badge ${
                      resultType === 'healthy'
                        ? 'healthy'
                        : resultType === 'invalid'
                        ? 'invalid-img'
                        : 'diseased'
                    }`}
                  >
                    {resultType === 'healthy' ? (
                      <CheckCircleIcon className="disease-badge-icon" />
                    ) : resultType === 'invalid' ? (
                      <ImageIcon className="disease-badge-icon" />
                    ) : (
                      <BugIcon className="disease-badge-icon" />
                    )}
                    {resultType === 'healthy'
                      ? 'No Disease Detected'
                      : result.disease}
                  </div>
                </div>

                {/* Cause */}
                <div className="cause-section">
                  <span className="section-label">Cause</span>
                  <div className="cause-content">
                    <AlertTriangleIcon className="cause-icon" />
                    <p>{result.cause}</p>
                  </div>
                </div>

                {/* Treatment */}
                <div className="treatment-section">
                  <span className="section-label">Treatment</span>
                  <ol className="treatment-list">
                    {result.treatment.map((step, index) => (
                      <li key={index} className="treatment-item">
                        <span className="treatment-item-number">{index + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Empty State — no result yet, not loading */}
            {!result && !loading && (
              <div className="empty-state">
                <SparklesIcon className="empty-state-icon" />
                <p className="empty-state-text">
                  Click <strong>"Analyze Leaf"</strong> to start<br />AI-powered diagnosis
                </p>
              </div>
            )}
          </div>
        </section>
      )}

    </>
  );
}

export default App;
