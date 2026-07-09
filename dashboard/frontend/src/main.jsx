import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// StrictMode removed: it double-invokes useEffect in dev,
// causing the ML analysis to run twice on a single click.
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
