const state = { revision: 0, listeners: new Set() };

export const smtpConfigStore = {
  notifyUpdated() {
    state.revision += 1;
    state.listeners.forEach((fn) => fn(state.revision));
  },

  subscribe(fn) {
    state.listeners.add(fn);
    fn(state.revision);
    return () => state.listeners.delete(fn);
  },
};
