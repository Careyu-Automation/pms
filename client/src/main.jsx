import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Loader } from './components/ui/Loader';
import { router } from './routes/AppRoutes';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/auth.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider
      router={router}
      fallbackElement={<Loader fullPage label="Loading workspace" />}
      future={{ v7_startTransition: true }}
    />
  </StrictMode>,
);
