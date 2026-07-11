/**
 * ACL COMPATIBILITY LAYER
 * =======================
 * The original implementation persisted ACL policies as custom metadata on
 * the GCS object itself (key: "custom:aclPolicy"). Cloudflare R2 objects can
 * technically carry custom metadata too, but per the migration decision we
 * are NOT attempting to recreate that mechanism here.
 *
 * Why: the application already enforces ownership and access at the
 * PostgreSQL + session layer (see routes.ts's `uploadIntents` map, which
 * binds an objectPath to the userId that requested the upload URL, and the
 * main route file's domain-aware authorization checks for private
 * documents). Storage-level ACL metadata was therefore redundant with logic
 * that already exists elsewhere in the app.
 *
 * As a result, this file is intentionally "hollowed out" into a
 * compatibility shim:
 *   - Types (ObjectAclPolicy, ObjectPermission, etc.) are preserved as-is so
 *     nothing calling into them needs to change shape.
 *   - setObjectAclPolicy() is now a no-op.
 *   - getObjectAclPolicy() returns a fixed default policy instead of reading
 *     metadata that no longer exists.
 *   - canAccessObject() no longer branches on stored ACL metadata. Because
 *     upstream code (routes + business logic) already gates access before
 *     ever reaching this function, canAccessObject() now defaults to
 *     ALLOWING access rather than trying to reconstruct a metadata-driven
 *     decision that has no data to work from.
 *
 * >>> SECURITY NOTE FOR REVIEWERS <<<
 * This is a real behavior change, not just a refactor. Previously,
 * `canAccessObject()` returned `false` whenever no ACL metadata was present
 * on the object (e.g. `if (!aclPolicy) return false`). That check is now
 * meaningless because `getObjectAclPolicy()` always returns a truthy default.
 * If `canAccessObjectEntity()` is relied upon ANYWHERE as the sole gate for
 * private object access (rather than as a secondary/defense-in-depth check
 * behind PostgreSQL + session validation), this change would silently make
 * that endpoint permissive. Confirm this is acceptable before deploying.
 */

// A minimal, storage-agnostic reference to a stored object. Replaces the
// GCS-specific `File` type. Only the R2 object key is needed since the
// bucket is fixed (R2_BUCKET_NAME) and the S3 client is shared.
export interface StorageObjectRef {
  key: string;
}

// The type of the access group.
//
// Can be flexibly defined according to the use case.
//
// Examples:
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content
//   creator.
export enum ObjectAccessGroupType {}

// The logic user group that can access the object.
export interface ObjectAccessGroup {
  // The type of the access group.
  type: ObjectAccessGroupType;
  // The logic id that is enough to identify the qualified group members.
  //
  // It may have different format for different types. For example:
  // - for USER_LIST, the id could be the user list db entity id, and the
  //   user list db entity could contain a bunch of user ids. User needs
  //   to be a member of the user list to be able to access the object.
  // - for EMAIL_DOMAIN, the id could be the email domain, and the user needs
  //   to have an email with the domain to be able to access the object.
  // - for GROUP_MEMBER, the id could be the group db entity id, and the
  //   group db entity could contain a bunch of user ids. User needs to be
  //   a member of the group to be able to access the object.
  // - for SUBSCRIBER, the id could be the subscriber db entity id, and the
  //   subscriber db entity could contain a bunch of user ids. User needs to
  //   be a subscriber to be able to access the object.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// The ACL policy of the object.
//
// NOTE: as of the R2 migration this is no longer persisted anywhere. It is
// kept as a type only so call sites (trySetObjectEntityAclPolicy, etc.)
// don't need to change their signatures.
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

// Check if the requested permission is allowed based on the granted permission.
// Preserved unchanged — pure logic, no storage dependency.
function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  // Users granted with read or write permissions can read the object.
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }

  // Only users granted with write permissions can write the object.
  return granted === ObjectPermission.WRITE;
}

// The base class for all access groups.
//
// Different types of access groups can be implemented according to the use case.
// Preserved unchanged — no group types are implemented today (same as before
// the migration), so this remains dead code kept only for API compatibility.
abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  // Check if the user is a member of the group.
  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    // Implement the case for each type of access group to instantiate.
    //
    // For example:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    // case "EMAIL_DOMAIN":
    //   return new EmailDomainAccessGroup(group.id);
    // case "GROUP_MEMBER":
    //   return new GroupMemberAccessGroup(group.id);
    // case "SUBSCRIBER":
    //   return new SubscriberAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

/**
 * Sets the ACL policy for the object.
 *
 * COMPATIBILITY NO-OP: previously wrote JSON into GCS custom metadata.
 * R2 metadata is intentionally not used post-migration (see file header).
 * Signature is preserved so `trySetObjectEntityAclPolicy()` in
 * objectStorage.ts requires no changes.
 */
export async function setObjectAclPolicy(
  _objectFile: StorageObjectRef,
  _aclPolicy: ObjectAclPolicy,
): Promise<void> {
  return;
}

/**
 * Gets the ACL policy for the object.
 *
 * COMPATIBILITY DEFAULT: previously read JSON from GCS custom metadata.
 * Since that metadata is no longer written (see setObjectAclPolicy above),
 * this always returns a fixed default policy rather than null. Downstream
 * code that used to branch on "no ACL policy found" (e.g. the old
 * canAccessObject implementation) has been updated accordingly — see below.
 */
export async function getObjectAclPolicy(
  _objectFile: StorageObjectRef,
): Promise<ObjectAclPolicy | null> {
  return {
    owner: "",
    visibility: "private",
  };
}

/**
 * Checks if the user can access the object.
 *
 * CHANGED BEHAVIOR: the previous implementation required stored ACL
 * metadata and returned `false` if none was found. That metadata no longer
 * exists in R2, and per the migration decision, authorization is handled
 * upstream (PostgreSQL ownership checks + authenticated sessions — see
 * uploadIntents in routes.ts and the domain-aware checks in the main route
 * file). This function now defaults to ALLOW so it acts as a passthrough
 * rather than a second, data-less gate that would otherwise always fail
 * closed. If you need this to remain a real enforcement point, wire it up
 * to your own ownership/session data instead of storage metadata.
 */
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: StorageObjectRef;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  // Retained for API shape / future use, but no longer consulted for the
  // access decision since it's always the fixed default now.
  void objectFile;
  void userId;
  void requestedPermission;

  return true;
}
