import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './soilcrop.css'
import Layout from './Layout.jsx'
import LeafScan from './App.jsx'
import SoilCrop from './SoilCrop.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LeafScan />} />
          <Route path="soilcrop" element={<SoilCrop />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
