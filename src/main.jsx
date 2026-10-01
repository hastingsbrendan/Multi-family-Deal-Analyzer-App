import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './styles/index.css';
import App from './components/App';
import ErrorBoundary from './components/ErrorBoundary';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { initAnalytics } from './lib/analytics';

Sentry.init({
  dsn: 'https://1427d8f17bc8fb78a755d240cdf1741f@o4511005787357184.ingest.us.sentry.io/4511005788930048',
  environment: window.location.hostname === 'localhost'
    ? 'development'
    : window.location.hostname === 'renthack.io'
    ? 'production'
    : 'preview',
  sendDefaultPii: false,
  tracesSampleRate: 0.2,       // 20% of sessions get performance traces
  replaysSessionSampleRate: 0, // no blanket session replay (privacy)
  replaysOnErrorSampleRate: 1.0, // replay only when an error occurs
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,        // mask all text in replays (hides financial data)
      blockAllMedia: true,
    }),
  ],
});

// PostHog product analytics. The init call was dropped from App.jsx in a March 2026
// refactor, so nothing had been recorded since. Production only, so local and preview
// traffic doesn't mix into the data; loads in its own chunk after startup.
if (window.location.hostname === 'renthack.io') initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <SubscriptionProvider>
      <App />
    </SubscriptionProvider>
  </ErrorBoundary>
);
