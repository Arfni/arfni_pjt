import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/styles/index.css'
import './shared/config/i18n' // Initialize i18n
import { App } from './app'
import { BrowserRouter } from 'react-router-dom';

createRoot(document.getElementById('root')!).render(
  
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
