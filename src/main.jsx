import { createRoot } from 'react-dom/client'
import './index.css'
import './offline.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker with default settings for stability
// We avoid 'immediate: true' if we suspect reload loops
registerSW()

createRoot(document.getElementById('root')).render(
  <App />
)
