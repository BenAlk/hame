import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { PwaPrompts } from './components/pwa-prompts'
import { Toaster } from './components/toaster'
import { ApiError } from './api/client'
import { toast } from './stores/toast'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
  // A single safety net: any mutation that rejects without its own `onError`
  // surfaces a toast, so a failed action is never silent (spec §8.13). A
  // mutation with bespoke handling sets `onError`, or `meta.silent` to opt out.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.options.onError || mutation.meta?.silent) return
      const message =
        error instanceof ApiError ? error.message : 'Something went wrong — please try again.'
      toast.error(message)
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
        <PwaPrompts />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
