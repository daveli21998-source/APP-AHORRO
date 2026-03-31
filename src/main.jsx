import { createRoot } from 'react-dom/client'
import './index.css'
import './offline.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker and log when ready for offline use
registerSW({
  onOfflineReady() {
    console.log('--- APP LISTA PARA USAR SIN INTERNET ---')
  }
})

createRoot(document.getElementById('root')).render(
  <App />
)
