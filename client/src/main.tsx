import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import ServerWakeUp from "./components/ServerWakeUp.tsx";

import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient();
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServerWakeUp>
      <QueryClientProvider client={queryClient}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <Toaster position="top-right" />
          <App />
        </GoogleOAuthProvider>
      </QueryClientProvider>
    </ServerWakeUp>
  </StrictMode>,
)