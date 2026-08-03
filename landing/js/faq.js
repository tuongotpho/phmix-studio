/**
 * FAQ Accordion module for pH-mix Landing Page
 * Handles item expanding/collapsing and accessibility attributes
 */

export function initFAQ() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const isExpanded = item.classList.contains('active');
            
            // Close all items
            document.querySelectorAll('.accordion-item').forEach(otherItem => {
                otherItem.classList.remove('active');
                const otherHeader = otherItem.querySelector('.accordion-header');
                if (otherHeader) {
                    otherHeader.setAttribute('aria-expanded', 'false');
                }
            });
            
            // Toggle clicked item if it wasn't already active
            if (!isExpanded) {
                item.classList.add('active');
                header.setAttribute('aria-expanded', 'true');
            }
        });
    });
}
