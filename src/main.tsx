import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './pages.css'
import './workspace.css'
import App from './App'
import { ErrorBoundary } from './components/errors/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
