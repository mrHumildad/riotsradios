import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SplashScreen from './comp/SplashScreen.jsx'
import { logLatestPosts } from './lib/stationFeeds.js'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SplashScreen />
    <App />
  </StrictMode>,
)

// Temporary feed-contract probe: remove once the timeline UI is wired.
if (import.meta.env.DEV) void logLatestPosts()
