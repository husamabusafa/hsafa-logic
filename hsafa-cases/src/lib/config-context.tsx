import { createContext, useContext, useMemo } from 'react'
import { useLocalStorage } from './use-local-storage'
import { CoreClient } from './core-client'

const API_KEY = import.meta.env.VITE_CORE_API_KEY ?? ''

interface ConfigContextValue {
  haseefId: string
  setHaseefId: (id: string) => void
  coreUrl: string
  setCoreUrl: (url: string) => void
  apiKey: string
  client: CoreClient | null
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [haseefId, setHaseefId] = useLocalStorage('hsafa-tester-haseef-id', '')
  const [coreUrl, setCoreUrl] = useLocalStorage('hsafa-tester-core-url', 'http://localhost:3001')

  const client = useMemo(() => {
    if (!coreUrl || !API_KEY) return null
    return new CoreClient(coreUrl, API_KEY)
  }, [coreUrl])

  return (
    <ConfigContext.Provider
      value={{ haseefId, setHaseefId, coreUrl, setCoreUrl, apiKey: API_KEY, client }}
    >
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be inside ConfigProvider')
  return ctx
}
