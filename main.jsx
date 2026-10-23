import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import SplashScreen from './comp/SplashScreen.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SplashScreen />
    <App />
  </StrictMode>,
)
