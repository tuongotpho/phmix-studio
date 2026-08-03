/**
 * pH-mix Landing Page Frontend Script
 * Entry wrapper for modular scripts
 */

import { initNavbar } from './js/navbar.js';
import { initFAQ } from './js/faq.js';
import { initMockup } from './js/mockup.js';

document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initFAQ();
    initMockup();
});
