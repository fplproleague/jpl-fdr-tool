import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles/tokens.css'
import './styles/base.css'
import FDRTool from './FDRTool.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FDRTool />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>,
)
