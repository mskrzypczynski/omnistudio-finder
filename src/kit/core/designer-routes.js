'use strict';

/* The addresses that open an OmniStudio component in its designer, per
 * flavour and per kind: os (OmniScript), ip (Integration Procedure), dr
 * (DataRaptor / Data Mapper) and fc (FlexCard). Core (Lightning-native)
 * OmniStudio keeps every builder on the Lightning host; the managed packages
 * put the Integration Procedure and DataRaptor designers on Visualforce
 * pages, which live on another host (core/org-hosts.js vfHostFor).
 *
 * Placeholders: {id} is the record id, {sobject} its object, {ns} the package
 * namespace, {vfhost} the Visualforce host and {now} a timestamp that makes
 * the address unique. A template that starts with a path is relative to the
 * Lightning origin. Filling them in is left to each extension, which knows
 * which placeholders it has values for.
 *
 * Pure: no DOM, no chrome.*. */

export const DESIGNER_TEMPLATES = Object.freeze({
  native: Object.freeze({
    os: '/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id={id}',
    ip: '/builder_industries_interaction_rule/industriesBuilder.app?recordId={id}',
    dr: '/builder_omnistudio/omnistudioBuilder.app?type=dataraptor&id={id}',
    fc: '/builder_omnistudio/omnistudioBuilder.app?type=flexcard&id={id}'
  }),
  managed: Object.freeze({
    os: '/lightning/cmp/{ns}__OmniDesignerAuraWrapper?c__recordId={id}&uid={now}',
    ip: 'https://{vfhost}/one/one.app#/alohaRedirect/apex/{ns}__integrationproceduredesigner?id={id}',
    dr: 'https://{vfhost}/one/one.app#/alohaRedirect/apex/{ns}__drmapper?id={id}',
    /* The managed FlexCard designer has no stable deep link, so this opens the
     * record page, which carries an Edit action through to the designer. */
    fc: '/lightning/r/{sobject}/{id}/view'
  })
});
