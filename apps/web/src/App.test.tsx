import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { App } from './App';

it('renders the accessible starter page without external services', () => {
  expect(renderToStaticMarkup(<App />)).toContain('<h1>AI 视频无限画布</h1>');
});
