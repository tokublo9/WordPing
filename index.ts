import 'react-native-url-polyfill/auto';
import React from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

function Root() {
  // The boundary wraps App rather than living inside it, so a throw from App's own
  // hooks is caught too. Without it a render error leaves only the black root view.
  return React.createElement(
    SafeAreaProvider,
    null,
    React.createElement(AppErrorBoundary, null, React.createElement(App)),
  );
}

registerRootComponent(Root);
