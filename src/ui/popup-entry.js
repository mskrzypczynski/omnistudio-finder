// popup-entry.js — the one script popup.html loads. Kept separate from popup.js
// so tests can import the module without it booting against a live org.
import { boot } from "./popup.js";

boot();
