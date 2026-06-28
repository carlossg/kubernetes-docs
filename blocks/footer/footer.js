import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  let fragment = null;
  try {
    fragment = await loadFragment(footerPath);
  } catch (e) {
    // console.warn('Failed to load footer fragment', e);
  }

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  footer.className = 'footer-content';
  
  if (fragment) {
    while (fragment.firstElementChild) footer.append(fragment.firstElementChild);
  }

  // Add the CC-BY-4.0 license notice
  const licenseDiv = document.createElement('div');
  licenseDiv.className = 'footer-license';
  licenseDiv.innerHTML = '<p>© 2026 The Kubernetes Authors | Documentation distributed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Sourced and adapted from <a href="https://github.com/kubernetes/website" target="_blank" rel="noopener noreferrer">kubernetes/website</a>.</p>';
  footer.append(licenseDiv);

  block.append(footer);
}
