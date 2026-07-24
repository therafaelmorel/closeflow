import './databaseOnly'
import './BudgetFeature'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AuthApp from './AuthApp'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthApp>
      <App />
    </AuthApp>
  </StrictMode>,
)
