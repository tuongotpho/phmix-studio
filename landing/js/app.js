/**
 * Main Application Script for pH-mix Landing Page
 * Initializes all modular handlers upon DOM Content Loaded
 */

import { initNavbar } from './navbar.js';
import { initFAQ } from './faq.js';
import { initMockup } from './mockup.js';

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initFAQ();
    initMockup();
});
