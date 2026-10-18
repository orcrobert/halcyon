import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { applyTheme, storedTheme } from './themes'
import { applyReduceBlur, storedReduceBlur } from './effects'

applyTheme(storedTheme())
applyReduceBlur(storedReduceBlur())

function mount(root: ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{root}</StrictMode>)
}

if (import.meta.env.VITE_DEMO === 'true') {
  import('./demo/DemoApp').then(({ default: DemoApp }) => mount(<DemoApp />))
} else {
  mount(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )
}
