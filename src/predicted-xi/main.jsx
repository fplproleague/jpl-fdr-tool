import React from 'react'
import ReactDOM from 'react-dom/client'
import PredictedXiBuilder from './PredictedXiBuilder.jsx'

// Eigen React-root, volledig los van src/main.jsx/FDRTool.jsx — bewust ZONDER Analytics/SpeedInsights:
// dit is een niet-gelinkte, persoonlijke tool, geen reden om daar Vercel-analytics-ruis voor te genereren.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PredictedXiBuilder />
  </React.StrictMode>,
)
