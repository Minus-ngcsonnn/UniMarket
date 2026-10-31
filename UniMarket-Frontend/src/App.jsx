import { Route, Routes } from 'react-router'
import HomePage from './pages/HomePage'

/** Application routes. Add new pages here as features are implemented. */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  )
}
