import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import './index.css'

const isDashboard = window.location.pathname.startsWith('/dashboard')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDashboard
      ? <Dashboard />
      : <ThemeProvider><App /></ThemeProvider>
    }
  </React.StrictMode>,
)
