'use strict';

/* The host names one Salesforce org shows up under, and the mapping between
 * them:
 *
 *   UI host   lightning.force.com / my.salesforce-setup.com, where a user works
 *   API host  my.salesforce.com, where the session cookie lives
 *   VF host   vf.force.com, where the managed Integration Procedure and
 *             DataRaptor designers live
 *
 * Pure string work: no network, no DOM, no chrome.*. */

/* The my.salesforce.com host that carries the session cookie for a UI host.
 * null for a host that is not a Salesforce one. */
export function apiHostFor(uiHost) {
  if (uiHost.endsWith('.my.salesforce.com')) return uiHost;
  if (uiHost.endsWith('.lightning.force.com')) return uiHost.replace(/\.lightning\.force\.com$/, '.my.salesforce.com');
  if (uiHost.endsWith('.my.salesforce-setup.com')) return uiHost.replace(/\.my\.salesforce-setup\.com$/, '.my.salesforce.com');
  if (uiHost.endsWith('.salesforce.com')) return uiHost;
  if (uiHost.endsWith('.force.com')) return uiHost; // Experience and Visualforce fallback
  return null;
}

/* A page on a Visualforce host (a managed designer, or a page of the org's
 * own) maps back to the Lightning host, so links built from it do not land
 * on vf.force.com, which has no /lightning/ pages:
 *   mydomain--sb--vlocity-ins.sandbox.vf.force.com
 *   -> mydomain--sb.sandbox.lightning.force.com
 * With enhanced domains a Visualforce label always ends in `--<package>`
 * (a namespace, or `c` for a page of the org's own), and a My Domain name
 * cannot hold `--` itself, so the last segment is always the package,
 * whichever package it is. Any other host is returned as it is. */
export function lightningHostFor(uiHost) {
  if (!uiHost.endsWith('.vf.force.com')) return uiHost;
  const [label, ...rest] = uiHost.split('.');
  const parts = label.split('--');
  if (parts.length > 1) parts.pop();
  return [parts.join('--'), ...rest].join('.').replace(/vf\.force\.com$/, 'lightning.force.com');
}

/* The Visualforce host of a namespaced managed package, built from the My
 * Domain label plus the namespace with underscores turned into hyphens:
 *   mydomain--sb.sandbox.lightning.force.com
 *   -> mydomain--sb--vlocity-ins.sandbox.vf.force.com
 * null without a namespace or for a host that is not a Lightning one. */
export function vfHostFor(uiHost, namespace) {
  if (!namespace) return null;
  const match = uiHost.match(/^([^.]+)\.(.*)lightning\.force\.com$/);
  if (!match) return null;
  return `${match[1]}--${namespace.replace(/_/g, '-')}.${match[2]}vf.force.com`;
}

/* Is this a URL on a Salesforce-owned domain an extension can talk to?
 * false for anything that does not parse. */
export function isSalesforceUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    return /\.(salesforce|force|salesforce-setup|cloudforce)\.com$/.test(host);
  } catch {
    return false;
  }
}
