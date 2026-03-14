import React from 'react';
import { createRoot } from 'react-dom/client';
import { LandingPage } from '../views/LandingPage';
import { ToastProvider } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../styles.css';

function DevApp() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <LandingPage />
      </ToastProvider>
    </ErrorBoundary>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <DevApp />
    </React.StrictMode>
  );
}
