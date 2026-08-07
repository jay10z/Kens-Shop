import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import App from './App';
import { isSupabaseConfigured, supabaseConfigError } from './lib/supabase';
import './index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root not found');
}

if (!isSupabaseConfigured) {
  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:Georgia,serif;background:#121210;color:#f3efe6;text-align:center">
      <div style="max-width:34rem">
        <p style="letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:#c4a574;margin:0 0 12px">KEN'S SHOP</p>
        <h1 style="font-size:1.75rem;margin:0 0 12px;font-weight:500">Storefront configuration error</h1>
        <p style="margin:0;line-height:1.55;color:#b9b3a6">${supabaseConfigError}</p>
      </div>
    </div>
  `;
} else {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
