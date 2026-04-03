import { WatchWardenCard } from "./card.js";
import { WatchWardenCardEditor } from "./editor.js";

customElements.define("watchwarden-card", WatchWardenCard);
customElements.define("watchwarden-card-editor", WatchWardenCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "watchwarden-card",
  name: "WatchWarden",
  description: "Dashboard card for WatchWarden container updates and health.",
  preview: false,
  documentationURL: "https://github.com/watchwarden-labs/watchwarden-custom-card",
});

console.info(
  "%c WATCHWARDEN-CARD %c loaded ",
  "color: white; background: #4fc3f7; font-weight: bold; padding: 2px 6px; border-radius: 3px 0 0 3px;",
  "color: #4fc3f7; background: #1e1e2e; font-weight: bold; padding: 2px 6px; border-radius: 0 3px 3px 0;",
);
