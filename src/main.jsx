import { createRoot } from 'react-dom/client'
import './index.css'
import './offline.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register PWA service worker with verbose reporting for debugging
registerSW({
  onRegistered(r) {
    console.log('SW Registered:', r);
    window.dispatchEvent(new Event('app-registered'));
  },
  onRegisterError(e) {
    console.error('SW Register Error:', e);
  },
  onOfflineReady() {
    console.log('SW Offline Ready');
    window.dispatchEvent(new Event('app-offline-ready'));
  }
})

createRoot(document.getElementById('root')).render(
  <App />
)
