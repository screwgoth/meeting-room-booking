import type { Credentials, IdentityProvider, Principal } from './types.js';

/**
 * v2 seam (§4). LDAP/AD directory bind — NOT OIDC (D2). Intentionally NOT wired
 * in v1; it documents the drop-in shape so no caller, route, or session code
 * changes when the real adapter lands.
 *
 * The real implementation will: bind with BIND_DN_template.format(username) +
 * password (the bind IS the auth — we never store the directory password),
 * search for objectGUID/mail/displayName/memberOf, upsert the user by
 * (auth_source='LDAP', directory_id=objectGUID), and map AD groups -> role.
 * See ARCHITECTURE.md §4/§8 — bind strategy + group mapping are a gated ⚠ decision.
 */
export class LdapProvider implements IdentityProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  authenticate(_credentials: Credentials): Promise<Principal> {
    throw new Error(
      'LdapProvider is a v2 seam and is not enabled in v1. ' +
        'Configure the directory bind (§4/§8) before enabling.',
    );
  }
}
