/**
 * Express Request tip genişletmesi: JwtAuthGuard request.user'a bağlar.
 */
import 'express-serve-static-core';
import type { RequestUser } from '../common/request-context';

declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestUser | null;
  }
}
