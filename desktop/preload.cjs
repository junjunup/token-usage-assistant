const { contextBridge, ipcRenderer } = require('electron');
const call = (channel, value) => ipcRenderer.invoke(channel, value);
contextBridge.exposeInMainWorld(
  'tokenAssistant',
  Object.freeze({
    getState: () => call('assistant:get-state'),
    connect: (value) => call('assistant:connect', value),
    disconnect: () => call('assistant:disconnect'),
    selectAccount: (id) => call('assistant:select-account', id),
    refresh: () => call('assistant:refresh'),
    retryCredentials: () => call('assistant:retry-credentials'),
    saveBillingGroup: (value) => call('assistant:save-billing-group', value),
    removeBillingGroup: (id) => call('assistant:remove-billing-group', id),
    saveAccountLink: (value) => call('assistant:save-account-link', value),
    removeAccountLink: (id) => call('assistant:remove-account-link', id),
    analytics: (query) => call('assistant:analytics', query),
    cancelAnalytics: (id) => call('assistant:cancel-analytics', id),
    addToolSource: (value) => call('assistant:add-tool-source', value),
    updateToolSource: (id, patch) => call('assistant:update-tool-source', { id, patch }),
    chooseToolSource: (id) => call('assistant:choose-tool-source', id),
    removeToolSource: (id) => call('assistant:remove-tool-source', id),
    syncToolSource: (id) => call('assistant:sync-tool-source', id),
    chooseLocalDatabase: () => call('assistant:choose-local'),
    saveModelPrice: (value) => call('assistant:model-price', value),
    setSettings: (value) => call('assistant:settings', value),
    window: (action) => call('assistant:window', action),
    openOfficial: (target) => call('assistant:official', target),
    testNotification: () => call('assistant:test-notification'),
    openUpdate: () => call('assistant:open-update'),
    previewDiagnostics: () => call('assistant:diagnostics-preview'),
    saveDiagnostics: () => call('assistant:diagnostics-save'),
    ready: () => call('assistant:renderer-ready'),
    // Popover panel (T7.6); main.cjs only accepts these from the panel window.
    panelState: () => call('assistant:panel-state'),
    panelResize: (height) => call('assistant:panel-resize', height),
    panelOfficial: (accountId) => call('assistant:panel-official', accountId),
    panelMain: () => call('assistant:panel-main'),
    onPanel: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('assistant:panel', listener);
      return () => ipcRenderer.removeListener('assistant:panel', listener);
    },
    onState: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('assistant:state', listener);
      return () => ipcRenderer.removeListener('assistant:state', listener);
    },
  }),
);
