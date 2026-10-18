import React from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopApp } from './DesktopApp.jsx';
import { Panel } from './Panel.jsx';
import './styles.css';

// ?surface=panel is the macOS menu-bar popover (T7.6); every other surface is the desktop app (main / widget).
const panel = new URLSearchParams(location.search).get('surface') === 'panel';
if (panel) document.documentElement.classList.add('panel-surface');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{panel ? <Panel /> : <DesktopApp />}</React.StrictMode>,
);
