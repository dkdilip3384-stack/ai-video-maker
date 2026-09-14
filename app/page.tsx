'use client';

import { useState } from 'react';

export default function HomePage() {
  const [mode, setMode] = useState<'promo' | 'film'>('promo');

  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">AI VIDEO MAKER</div>
        <h1>Story to real moving video</h1>
        <p>
          Upload your logo, app screens or references, describe the story, and build a
          professional promo video or AI short film — not a photo slideshow.
        </p>
      </section>

      <section className="modeGrid">
        <button className={mode === 'promo' ? 'mode active' : 'mode'} onClick={() => setMode('promo')}>
          <span className="modeTitle">Promo Mode</span>
          <span>Logo + screens + features → animated app/product promo</span>
        </button>
        <button className={mode === 'film' ? 'mode active' : 'mode'} onClick={() => setMode('film')}>
          <span className="modeTitle">AI Film Mode</span>
          <span>Story → cinematic scenes + voice + subtitles + music</span>
        </button>
      </section>

      <section className="panel">
        <label>
          Story / Prompt
          <textarea placeholder={mode === 'promo' ? 'Example: Create a 30-second Tamil promo for my expense app...' : 'Example: A delivery rider finishes a long day and reaches home...'} />
        </label>

        <div className="twoCol">
          <label>
            Language
            <select defaultValue="ta">
              <option value="ta">Tamil</option>
              <option value="en">English</option>
              <option value="mix">Tamil + English</option>
            </select>
          </label>
          <label>
            Format
            <select defaultValue="9:16">
              <option>9:16</option>
              <option>16:9</option>
              <option>1:1</option>
            </select>
          </label>
        </div>

        <label>
          Assets
          <input type="file" multiple accept="image/*,video/*" />
          <small>Logo, screenshots, screen recordings, reference images or video clips.</small>
        </label>

        <button className="primary" type="button">Create Video Project</button>
      </section>

      <section className="flow">
        <h2>Automatic pipeline</h2>
        <div className="steps">
          {['Understand story', 'Build scenes', 'Generate motion clips', 'Add voice & subtitles', 'Render final MP4'].map((item, i) => (
            <div className="step" key={item}>
              <span>{i + 1}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
