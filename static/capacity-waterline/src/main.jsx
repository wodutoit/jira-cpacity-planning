import React from 'react';
import ReactDOM from 'react-dom/client';
import { view } from '@forge/bridge';
import './styles.css';
import App from './App';
import GadgetView from './gadget/GadgetView';
import GadgetEdit from './gadget/GadgetEdit';

// All modules (the globalPage app + the dashboard gadget's view/edit) share this
// one static bundle — cheaper than a second Vite build. Branch on context instead.
const GADGET_MODULE_KEY = 'release-team-gadget';

async function bootstrap() {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  const ctx = await view.getContext().catch(() => ({}));

  let Component = App;
  if (ctx.moduleKey === GADGET_MODULE_KEY) {
    Component = ctx.extension?.entryPoint === 'edit' ? GadgetEdit : GadgetView;
  }

  root.render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  );
}

bootstrap();
