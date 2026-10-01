import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
  READ = 'read',
}

export interface FirestoreErrorInfo {
  error: string;
  code?: string;
  operationType: OperationType | string;
  collection: string;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    userRole?: string | null;
  };
}

/**
 * Diagnostic logger for Firestore operations.
 * Produces structured console output for debugging permission errors:
 *
 * Firestore Permission Error
 * Collection: orders
 * Operation: read
 * User UID: XXXXX
 * User Role: admin
 */
export function logFirestoreError(
  error: unknown,
  collectionName: string,
  operation: OperationType | string,
  userRole?: string | null
): void {
  const currentUid = auth.currentUser?.uid || 'anonymous';
  const currentEmail = auth.currentUser?.email || '(none)';
  const resolvedRole = userRole || 'unknown';
  const errorCode = (error as any)?.code || 'unknown';
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(
    `[Firestore Permission Error]\n` +
    `Collection: ${collectionName}\n` +
    `Operation: ${operation}\n` +
    `User UID: ${currentUid}\n` +
    `User Email: ${currentEmail}\n` +
    `User Role: ${resolvedRole}\n` +
    `Error Code: ${errorCode}\n` +
    `Message: ${errorMessage}`
  );
}

/**
 * Handle Firestore error and throw structured Error info
 */
export function handleFirestoreError(
  error: unknown,
  collectionName: string,
  operation: OperationType | string,
  userRole?: string | null
): never {
  logFirestoreError(error, collectionName, operation, userRole);
  const currentUid = auth.currentUser?.uid || null;
  const currentEmail = auth.currentUser?.email || null;
  const resolvedRole = userRole || 'unknown';
  const errorMessage = error instanceof Error ? error.message : String(error);

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    code: (error as any)?.code,
    operationType: operation,
    collection: collectionName,
    path: collectionName,
    authInfo: {
      userId: currentUid,
      email: currentEmail,
      userRole: resolvedRole,
    }
  };

  throw new Error(JSON.stringify(errInfo));
}
