import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { RoomPage } from './pages/RoomPage.tsx';
import { DexPage } from './pages/DexPage.tsx';
import { GroupsPage } from './pages/GroupsPage.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/dex" element={<DexPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/room/:code" element={<RoomPage />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
