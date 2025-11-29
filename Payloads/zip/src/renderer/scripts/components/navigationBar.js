/**
 * components/navigationBar.js
 * Wires the transport controls and address bar events.
 */
export const initNavigationBar = ({ elements, bridge }) => {
  const { backButton, forwardButton, reloadButton, addressBar, goButton } = elements;

  const navigateFromAddress = () => {
    bridge.navigate(addressBar.value);
    addressBar.blur();
  };

  backButton.addEventListener('click', () => bridge.goBack());
  forwardButton.addEventListener('click', () => bridge.goForward());
  reloadButton.addEventListener('click', () => bridge.reload());
  goButton.addEventListener('click', navigateFromAddress);

  addressBar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      navigateFromAddress();
    }
  });

  addressBar.addEventListener('focus', () => addressBar.select());

  const render = (state) => {
    backButton.disabled = !state.navigation.canGoBack;
    forwardButton.disabled = !state.navigation.canGoForward;

    if (document.activeElement !== addressBar) {
      addressBar.value = state.navigation.url || '';
    }
  };

  return { render };
};
