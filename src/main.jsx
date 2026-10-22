import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import { BrandingProvider } from './context/BrandingContext.jsx'
import './index.css'
import { initializeSalesStorage } from './utils/salesStorage'

const isDashboard = window.location.pathname.startsWith('/dashboard')

const root = document.getElementById('root')
root.textContent = 'Loading local sales…'
initializeSalesStorage().then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <BrandingProvider>
        {isDashboard
          ? <Dashboard />
          : <ThemeProvider><App /></ThemeProvider>
        }
      </BrandingProvider>
    </React.StrictMode>,
  )
})
