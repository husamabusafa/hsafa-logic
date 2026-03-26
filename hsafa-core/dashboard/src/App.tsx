import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HaseefsPage from './pages/Haseefs'
import HaseefDetailPage from './pages/HaseefDetail'
import ScopesPage from './pages/Scopes'
import ScopeDetailPage from './pages/ScopeDetail'
import RunsPage from './pages/Runs'
import LiveFeedPage from './pages/LiveFeed'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/haseefs" replace />} />
        <Route path="/haseefs" element={<HaseefsPage />} />
        <Route path="/haseefs/:id" element={<HaseefDetailPage />} />
        <Route path="/scopes" element={<ScopesPage />} />
        <Route path="/scopes/:scope" element={<ScopeDetailPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/live/:id" element={<LiveFeedPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
