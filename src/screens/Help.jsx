import React from 'react';
import { back, navigate } from '../lib/router.js';
import { Btn, Icon, Page } from '../ui/kit.jsx';

const TIPS = [
  ['search', 'Find anything', 'Type or say what you want on the Find screen — “blender”, “Christmas lights”, or a box number like “12”. Tap “Show me” to see it light up on the shelves.'],
  ['nfc', 'Tap a tag', 'Hold your phone against the tag on a shelf section. It opens that section with every shelf and box on it.'],
  ['camera', 'Pack a box', 'Tap the big + button. Pick the shelf, snap the shelf, snap the box, open it and snap what’s inside, then type a few things. Repeat for the next box.'],
  ['out', 'Taking something?', 'Open it and tap “I’m taking this out” so everyone knows where it went. Tap “I put it back” when it’s home again.'],
  ['lock', 'Lock your things', 'Open your box or thing and turn on “Lock”. Then nobody can change or remove it without asking you first.'],
  ['bell', 'Say yes or no', 'When someone asks to change your locked things, the bell shows a number. Open it and tap Yes or No.'],
  ['undo', 'Made a mistake?', 'Right after any change, tap Undo at the bottom of the screen. Removed things also wait in the Trash.'],
  ['wifioff', 'No signal in the basement?', 'Keep going. Everything saves on your phone and sends itself when you’re back on Wi-Fi.']
];

export default function Help() {
  return (
    <Page back={() => back('/me')} title="How it works" kicker="Quick guide">
      {TIPS.map(([icon, title, text]) => (
        <section className="card helpCard" key={title}>
          <span className="menuIcon"><Icon name={icon} /></span>
          <div><h2>{title}</h2><p>{text}</p></div>
        </section>
      ))}
      <Btn big kind="primary" icon="search" onClick={() => navigate('/')}>Got it — let’s find something</Btn>
    </Page>
  );
}
