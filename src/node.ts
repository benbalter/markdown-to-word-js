// The npm package's Node entry. The converter parses HTML and the .docx XML
// parts with DOMParser and writes them back with XMLSerializer, which Node
// lacks. jsdom supplies them, and only when they're missing, so a runtime or
// test environment that already has a DOM keeps its own.
// A static import, not a top-level await import(): Node can require() an ES
// module only if it has no top-level await, so this keeps CommonJS working.
import { JSDOM } from 'jsdom';

const globals = globalThis as { DOMParser?: unknown; XMLSerializer?: unknown };
if (!globals.DOMParser || !globals.XMLSerializer) {
  const { window } = new JSDOM('');
  globals.DOMParser ??= window.DOMParser;
  globals.XMLSerializer ??= window.XMLSerializer;
}

export * from './main.js';
