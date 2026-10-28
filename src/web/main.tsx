import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createApi } from './transport/client';
import { connectEvents } from './transport/events';
import { createMockApi } from './dev/mockApi';
import { RuntimeContext, createRuntime } from './state/context';
import { ToastProvider } from './components/ui';
import './styles.css';

const mock = new URLSearchParams(location.search).get('mock') === '1' ? createMockApi() : null;
const runtime = createRuntime(createApi(mock?.fetch), mock ? handlers => mock.connect(handlers) : connectEvents, !!mock);
const root = createRoot(document.getElementById('root')!);
root.render(<RuntimeContext.Provider value={runtime}><ToastProvider><App /></ToastProvider></RuntimeContext.Provider>);

// Dispose subscriptions and mock timers when the entry itself is replaced in dev.
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());