import React from 'react';
import ReactDOM from 'react-dom/client';
import { view } from '@forge/bridge';
import './styles.css';
import App from './App';
import ReleasePlanningGadgetView from './gadget/ReleasePlanningGadgetView';
import ReleasePlanningGadgetEdit from './gadget/ReleasePlanningGadgetEdit';
import ReleaseProgressGadgetView from './gadget/ReleaseProgressGadgetView';
import ReleaseProgressGadgetEdit from './gadget/ReleaseProgressGadgetEdit';
import ReleaseVelocityGadgetView from './gadget/ReleaseVelocityGadgetView';
import ReleaseVelocityGadgetEdit from './gadget/ReleaseVelocityGadgetEdit';

// All modules (the globalPage app + each dashboard gadget's view/edit) share this
// one static bundle — cheaper than a separate Vite build per gadget. Branch on
// context instead. Add new gadgets' manifest keys here as they're built.
const GADGETS = {
  'release-team-gadget': { view: ReleasePlanningGadgetView, edit: ReleasePlanningGadgetEdit },
  'release-progress-gadget': { view: ReleaseProgressGadgetView, edit: ReleaseProgressGadgetEdit },
  'release-velocity-gadget': { view: ReleaseVelocityGadgetView, edit: ReleaseVelocityGadgetEdit },
};

async function bootstrap() {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  const ctx = await view.getContext().catch(() => ({}));

  const gadget = GADGETS[ctx.moduleKey];
  const Component = gadget
    ? (ctx.extension?.entryPoint === 'edit' ? gadget.edit : gadget.view)
    : App;

  root.render(
    <React.StrictMode>
      <Component />
    </React.StrictMode>
  );
}

bootstrap();
