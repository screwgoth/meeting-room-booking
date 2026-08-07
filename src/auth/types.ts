/** Role vocabulary (§3/§4). Server-side RBAC keys off Principal.role. */
export type Role = 'EMPLOYEE' | 'ADMIN';

/**
 * The authenticated identity handed to the rest of the app. Downstream
 * (sessions, RBAC, @require_role) is provider-agnostic — identical whether the
 * Principal came from a local password or (v2) an LDAP/AD bind (§4).
 */
export interface Principal {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Identity-resolution port (§4). The v1 adapter is LocalPasswordProvider; the
 * v2 LDAP/AD adapter drops in here without touching callers, routes, or the
 * session layer. NOT OIDC (D2).
 */
export interface IdentityProvider {
  authenticate(credentials: Credentials): Promise<Principal>;
}
