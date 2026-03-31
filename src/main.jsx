import { createRoot } from 'react-dom/client'
import './index.css'
import './offline.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker and dispatch event when ready
registerSW({
  onOfflineReady() {
    window.dispatchEvent(new Event('app-offline-ready'));
  }
})

createRoot(document.getElementById('root')).render(
  <App />
)
